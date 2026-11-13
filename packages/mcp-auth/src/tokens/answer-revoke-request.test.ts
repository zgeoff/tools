import { expect, onTestFinished, test } from 'bun:test';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { buildFormRequest } from '../test-utils/build-form-request.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return {
    ...server,
    revoke: (fields: Record<string, string>) =>
      server.auth.routes.revoke(
        buildFormRequest('https://app.example/oauth2/revoke', new URLSearchParams(fields)),
        buildTestRequester(),
      ),
  };
}

test('#answerRevokeRequest ends the grant when its client revokes the refresh token', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  const answer = await ctx.revoke({
    token: tokens.refreshToken,
    token_type_hint: 'refresh_token',
    client_id: tokens.clientID,
  });

  const access = await ctx.auth.verify(tokens.accessToken);

  expect(answer.status).toBe(200);
  expect(access).toBeNull();
  expect(ctx.revoked).toStrictEqual([tokens.grantID]);
});

test('#answerRevokeRequest leaves the grant when another client names the refresh token', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });
  const stranger = await ctx.auth.clients.add('stranger', ['https://stranger.example/callback']);

  await ctx.revoke({
    token: tokens.refreshToken,
    token_type_hint: 'refresh_token',
    client_id: stranger.clientID,
  });

  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toMatchObject({ grantID: tokens.grantID });
  expect(ctx.revoked).toStrictEqual([]);
});

test('#answerRevokeRequest leaves the grant when the client revokes only an access token', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await ctx.revoke({
    token: tokens.accessToken,
    token_type_hint: 'access_token',
    client_id: tokens.clientID,
  });

  const grants = await ctx.auth.grants.list();

  expect(grants.map((grant) => grant.grantID)).toStrictEqual([tokens.grantID]);
  expect(ctx.revoked).toStrictEqual([]);
});

test('#answerRevokeRequest answers 200 for a token it does not know', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  const answer = await ctx.revoke({
    token: 'no-such-token',
    token_type_hint: 'refresh_token',
    client_id: tokens.clientID,
  });

  expect(answer.status).toBe(200);
  expect(ctx.revoked).toStrictEqual([]);
});

test('#answerRevokeRequest refuses a request with no body', async () => {
  const ctx = await setupTest();

  const answer = await ctx.auth.routes.revoke(
    new Request('https://app.example/oauth2/revoke', { method: 'POST' }),
    buildTestRequester(),
  );

  expect(answer.status).toBe(400);
});
