import { expect, onTestFinished, test } from 'bun:test';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { buildStubAuthenticator } from '../test-utils/build-stub-authenticator.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { runSignInToConsent } from '../test-utils/run-sign-in-to-consent.ts';
import { seedPasskey } from '../test-utils/seed-passkey.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return { ...server, authenticator: buildStubAuthenticator() };
}

test('#passkeys.createEnrollmentToken makes a token and stores only its hash', async () => {
  const ctx = await setupTest();
  const token = await ctx.auth.passkeys.createEnrollmentToken();

  const stored = ctx.database.query('select token_hash from app_enrollment_token').all();

  expect(token).toMatch(/^enroll-[A-Za-z0-9_-]{43}$/u);
  expect(JSON.stringify(stored)).not.toInclude(token);
  expect(stored).toHaveLength(1);
});

test('#passkeys.list lists the enrolled passkeys', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.auth, { authenticator: ctx.authenticator });

  const passkeys = await ctx.auth.passkeys.list();

  expect(passkeys).toStrictEqual([
    { id: ctx.authenticator.credentialID, createdAt: expect.any(String), lastUsedAt: null },
  ]);
});

test('#passkeys.remove removes the passkey', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.auth, { authenticator: ctx.authenticator });

  await ctx.auth.passkeys.remove(ctx.authenticator.credentialID);

  const passkeys = await ctx.auth.passkeys.list();

  expect(passkeys).toStrictEqual([]);
});

test('#passkeys.remove ends the browser sessions, so a login the passkey made goes no further', async () => {
  const ctx = await setupTest();
  const signIn = await runSignInToConsent(ctx.auth, { scopes: ['read'] });
  const [passkey] = await ctx.auth.passkeys.list();

  if (passkey === undefined) {
    throw new Error('the sign-in left no passkey');
  }

  await ctx.auth.passkeys.remove(passkey.id);

  const page = await ctx.auth.routes.consent(
    new Request(signIn.consent.href, { headers: { cookie: signIn.cookie } }),
    { socketAddress: null, connectingIP: null, userAgent: null },
  );

  expect(page.status).toBe(400);
});

test('#passkeys.reset removes every passkey and enrollment token', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.auth, { authenticator: ctx.authenticator });

  await ctx.auth.passkeys.createEnrollmentToken();
  await ctx.auth.passkeys.reset();

  const passkeys = await ctx.auth.passkeys.list();

  const tokens = ctx.database.query('select token_hash from app_enrollment_token').all();

  expect(passkeys).toStrictEqual([]);
  expect(tokens).toStrictEqual([]);
});

test('#passkeys.reset removes the grant row of a sign-in in progress and keeps a finished grant', async () => {
  const ctx = await setupTest();
  const finished = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await runSignInToConsent(ctx.auth, { scopes: ['read'] });

  await ctx.auth.passkeys.reset();

  const grants = await ctx.auth.grants.list();

  expect(grants.map((grant) => grant.grantID)).toStrictEqual([finished.grantID]);
  expect(ctx.revoked).toHaveLength(1);
  expect(ctx.revoked).not.toContain(finished.grantID);
});
