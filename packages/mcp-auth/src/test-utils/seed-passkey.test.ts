import { expect, onTestFinished, test } from 'bun:test';
import { buildStubAuthenticator } from './build-stub-authenticator.ts';
import { openTestAuth } from './open-test-auth.ts';
import { seedPasskey } from './seed-passkey.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return { ...server, authenticator: buildStubAuthenticator() };
}

test('it enrolls the passkey of the authenticator through the enrollment page', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.auth, { authenticator: ctx.authenticator });

  const passkeys = await ctx.auth.passkeys.list();

  expect(passkeys.map((passkey) => passkey.id)).toStrictEqual([ctx.authenticator.credentialID]);
});

test('it spends the enrollment token it makes', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.auth, { authenticator: ctx.authenticator });

  const tokens = ctx.database.query('select token_hash from app_enrollment_token').all();

  expect(tokens).toStrictEqual([]);
});
