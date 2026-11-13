import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { buildFormRequest } from '../test-utils/build-form-request.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { runSignInToConsent } from '../test-utils/run-sign-in-to-consent.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  const CountSchema = z.object({ total: z.number() });

  return {
    ...server,
    countRows: (table: string) =>
      CountSchema.parse(server.database.query(`select count(*) as total from "${table}"`).get())
        .total,
  };
}

test('#removeExpired removes an access token after fifteen minutes and keeps the refresh token', async () => {
  const ctx = await setupTest();

  await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  ctx.clock.advance(16 * 60_000);

  await ctx.auth.removeExpired();

  expect(ctx.countRows('oauthAccessToken')).toBe(0);
  expect(ctx.countRows('oauthRefreshToken')).toBe(1);
});

test('#removeExpired removes the grant row whose refresh token expired, and calls the hook', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  ctx.clock.advance(31 * 24 * 60 * 60_000);

  await ctx.auth.removeExpired();

  expect(ctx.countRows('user')).toBe(0);
  expect(ctx.countRows('oauthRefreshToken')).toBe(0);
  expect(ctx.revoked).toStrictEqual([tokens.grantID]);
});

test('#removeExpired keeps a grant whose refresh token is live', async () => {
  const ctx = await setupTest();

  await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  ctx.clock.advance(24 * 60 * 60_000);

  await ctx.auth.removeExpired();

  expect(ctx.countRows('user')).toBe(1);
  expect(ctx.revoked).toStrictEqual([]);
});

test('#removeExpired removes a sign-in that never finished once it is an hour old', async () => {
  const ctx = await setupTest();

  await runSignInToConsent(ctx.auth, { scopes: ['read'] });

  ctx.clock.advance(61 * 60_000);

  await ctx.auth.removeExpired();

  expect(ctx.countRows('user')).toBe(0);
  expect(ctx.revoked).toHaveLength(1);
});

test('#removeExpired keeps a sign-in that is under an hour old', async () => {
  const ctx = await setupTest();

  await runSignInToConsent(ctx.auth, { scopes: ['read'] });

  ctx.clock.advance(50 * 60_000);

  await ctx.auth.removeExpired();

  expect(ctx.countRows('user')).toBe(1);
  expect(ctx.revoked).toStrictEqual([]);
});

test('#removeExpired removes a browser session after thirty minutes', async () => {
  const ctx = await setupTest();

  await runSignInToConsent(ctx.auth, { scopes: ['read'] });

  const before = ctx.countRows('session');

  ctx.clock.advance(31 * 60_000);

  await ctx.auth.removeExpired();

  expect(before).toBe(1);
  expect(ctx.countRows('session')).toBe(0);
});

test('#removeExpired removes an authorization code after ten minutes', async () => {
  const ctx = await setupTest();
  const signIn = await runSignInToConsent(ctx.auth, { scopes: ['read'] });

  const form = new URLSearchParams({
    oauth_query: signIn.consent.search.slice(1),
    decision: 'approve',
    scope: 'read',
  });

  const headers = { origin: 'https://app.example', cookie: signIn.cookie };
  const request = buildFormRequest('https://app.example/consent', form, headers);

  await ctx.auth.routes.consent(request, buildTestRequester());

  const before = ctx.countRows('verification');

  ctx.clock.advance(11 * 60_000);

  await ctx.auth.removeExpired();

  expect(before).toBeGreaterThan(0);
  expect(ctx.countRows('verification')).toBe(0);
});

test('#removeExpired removes an enrollment token after fifteen minutes', async () => {
  const ctx = await setupTest();

  await ctx.auth.passkeys.createEnrollmentToken();

  ctx.clock.advance(16 * 60_000);

  await ctx.auth.removeExpired();

  expect(ctx.countRows('app_enrollment_token')).toBe(0);
});

test('#removeExpired keeps a rotated refresh token that has not expired', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await ctx.auth.routes.token(
    buildFormRequest(
      'https://app.example/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: tokens.clientID,
        refresh_token: tokens.refreshToken,
      }),
    ),
    buildTestRequester(),
  );

  await ctx.auth.removeExpired();

  expect(ctx.countRows('oauthRefreshToken')).toBe(2);
});
