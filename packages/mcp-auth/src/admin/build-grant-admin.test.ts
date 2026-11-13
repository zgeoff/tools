import { expect, onTestFinished, test } from 'bun:test';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { runSignInToConsent } from '../test-utils/run-sign-in-to-consent.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return server;
}

test('#grants.list lists a grant with a live refresh token', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read', 'write'] });
  const grants = await ctx.auth.grants.list();

  expect(grants).toStrictEqual([
    {
      grantID: tokens.grantID,
      clientID: tokens.clientID,
      clientName: expect.any(String),
      scopes: ['read', 'write'],
      approvedBy: 'passkey',
      createdAt: expect.any(String),
      lastUsedAt: null,
    },
  ]);
});

test('#grants.list leaves out a sign-in that has no token yet', async () => {
  const ctx = await setupTest();

  await runSignInToConsent(ctx.auth, { scopes: ['read'] });

  const grants = await ctx.auth.grants.list();

  expect(grants).toStrictEqual([]);
});

test('#grants.list leaves out a grant whose refresh token expired', async () => {
  const ctx = await setupTest();

  await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  ctx.clock.advance(31 * 24 * 60 * 60_000);

  const grants = await ctx.auth.grants.list();

  expect(grants).toStrictEqual([]);
});

test('#grants.list stamps lastUsedAt once verify has read a token of the grant', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await ctx.auth.verify(tokens.accessToken);

  const [grant] = await ctx.auth.grants.list();

  expect(grant?.lastUsedAt).toBe(new Date(ctx.clock.now()).toISOString());
});

test('#grants.revoke ends the grant, calls the hook once and returns true', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });
  const revoked = await ctx.auth.grants.revoke(tokens.grantID);
  const access = await ctx.auth.verify(tokens.accessToken);

  expect(revoked).toBeTrue();
  expect(access).toBeNull();
  expect(ctx.revoked).toStrictEqual([tokens.grantID]);
});

test('#grants.revoke returns false for an ID that no grant row has', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await ctx.auth.grants.revoke(tokens.grantID);

  const again = await ctx.auth.grants.revoke(tokens.grantID);

  expect(again).toBeFalse();
  expect(ctx.revoked).toStrictEqual([tokens.grantID]);
});
