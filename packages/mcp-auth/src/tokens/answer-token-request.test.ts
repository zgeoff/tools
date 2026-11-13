import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { openMCPAuthAdmin } from '../open-mcp-auth-admin.ts';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { buildFormRequest } from '../test-utils/build-form-request.ts';
import { buildStubClock } from '../test-utils/build-stub-clock.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { createTestDatabase } from '../test-utils/create-test-database.ts';
import { hookSQLiteStatements } from '../test-utils/hook-sqlite-statements.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import type { GrantID } from '../types.ts';

async function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'mcp-auth-token-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const serverDatabase = createTestDatabase(join(directory, 'auth.sqlite'));

  serverDatabase.run('PRAGMA journal_mode = WAL');
  serverDatabase.run('PRAGMA busy_timeout = 2000');

  const server = await openTestAuth({ database: serverDatabase });

  onTestFinished(() => server.close());

  // The other process: its own connection on the same file, and its own handle.
  const otherDatabase = createTestDatabase(join(directory, 'auth.sqlite'));

  otherDatabase.run('PRAGMA busy_timeout = 2000');

  const other = await openMCPAuthAdmin({
    database: otherDatabase,
    scopes: ['read', 'write'],
    tables: { passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' },
    clock: buildStubClock(),
    onGrantRevoked: () => {},
  });

  onTestFinished(async () => {
    await other.close();

    otherDatabase.close();
  });

  const CountSchema = z.object({ total: z.number() });

  const sendToken = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
    server.auth.routes.token(
      buildFormRequest('https://app.example/oauth2/token', new URLSearchParams(fields), headers),
      buildTestRequester(),
    );

  return {
    ...server,
    other,
    sendToken,
    refresh: (clientID: string, refreshToken: string) =>
      sendToken({ grant_type: 'refresh_token', client_id: clientID, refresh_token: refreshToken }),

    // Another connection's work runs at that exact point only when it is
    // synchronous, so this deletes the grant row with the core's own statement
    // and skips the admin handle's async layers.
    revokeBefore: (pattern: RegExp, grantID: GrantID) => {
      let hasRun = false;

      hookSQLiteStatements(serverDatabase, (statement) => {
        if (!hasRun && pattern.test(statement)) {
          hasRun = true;

          // oxlint-disable-next-line zgeoff/seed-only -- the race needs the core's own delete, run synchronously on a second connection
          otherDatabase.query('delete from "user" where "id" in (?) returning "id"').all(grantID);
        }
      });

      return { hasRun: () => hasRun };
    },
    countRows: (grantID: GrantID) => {
      const count = (table: string, column: string) =>
        CountSchema.parse(
          otherDatabase
            .query(`select count(*) as total from "${table}" where "${column}" = ?`)
            .get(grantID),
        ).total;

      return {
        grants: count('user', 'id'),
        accessTokens: count('oauthAccessToken', 'userId'),
        refreshTokens: count('oauthRefreshToken', 'userId'),
        sessions: count('session', 'userId'),
      };
    },
  };
}

// The statements of one refresh, in the order better-auth runs them.
test.each([
  ['after the read, before the old token is spent', /^update "oauthRefreshToken" set/u],
  ['before the new refresh token is written', /^insert into "oauthRefreshToken"/u],
  ['between the new refresh token and the new access token', /^insert into "oauthAccessToken"/u],
])(
  '#answerTokenRequest leaves no live token and answers invalid_grant to a refresh that a revoke on another connection interrupts %s',
  async (_point, pattern) => {
    const ctx = await setupTest();
    const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

    const revoke = ctx.revokeBefore(pattern, tokens.grantID);

    const answer = await ctx.refresh(tokens.clientID, tokens.refreshToken);
    const body: unknown = await answer.json();

    expect(revoke.hasRun()).toBeTrue();

    expect(ctx.countRows(tokens.grantID)).toStrictEqual({
      grants: 0,
      accessTokens: 0,
      refreshTokens: 0,
      sessions: 0,
    });

    expect(answer.status).toBe(400);
    expect(body).toMatchObject({ error: 'invalid_grant' });
  },
);

test.each([
  ['after the read, before the old token is spent', /^update "oauthRefreshToken" set/u],
  ['before the new refresh token is written', /^insert into "oauthRefreshToken"/u],
  ['between the new refresh token and the new access token', /^insert into "oauthAccessToken"/u],
])(
  '#answerTokenRequest lets no access token verify after a revoke on another connection %s',
  async (_point, pattern) => {
    const ctx = await setupTest();
    const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

    ctx.revokeBefore(pattern, tokens.grantID);

    const answer = await ctx.refresh(tokens.clientID, tokens.refreshToken);
    const body: unknown = await answer.json();

    const issued = z.object({ access_token: z.string() }).safeParse(body);

    const access = await ctx.auth.verify(tokens.accessToken);

    expect(access).toBeNull();
    expect(issued.success).toBeFalse();
  },
);

test('#answerTokenRequest answers invalid_grant to a refresh after a revoke', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await ctx.other.grants.revoke(tokens.grantID);

  const answer = await ctx.refresh(tokens.clientID, tokens.refreshToken);
  const body: unknown = await answer.json();

  expect(answer.status).toBe(400);
  expect(body).toMatchObject({ error: 'invalid_grant' });
});

test('#answerTokenRequest leaves no token after a revoke that follows a refresh', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });
  const answer = await ctx.refresh(tokens.clientID, tokens.refreshToken);
  const answered: unknown = await answer.json();

  const body = z.object({ access_token: z.string() }).parse(answered);

  await ctx.other.grants.revoke(tokens.grantID);

  const access = await ctx.auth.verify(body.access_token);

  expect(access).toBeNull();
  expect(ctx.countRows(tokens.grantID).refreshTokens).toBe(0);
});

test('#answerTokenRequest ends the grant of a client that presents a refresh token it was already replaced', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await ctx.refresh(tokens.clientID, tokens.refreshToken);

  const replay = await ctx.refresh(tokens.clientID, tokens.refreshToken);
  const grants = await ctx.auth.grants.list();

  expect(replay.status).toBe(400);
  expect(grants).toStrictEqual([]);
  expect(ctx.revoked).toStrictEqual([tokens.grantID]);
});

test('#answerTokenRequest ends the grant when two refreshes of one token run together', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  const answers = await Promise.all([
    ctx.refresh(tokens.clientID, tokens.refreshToken),
    ctx.refresh(tokens.clientID, tokens.refreshToken),
  ]);

  const bodies: unknown[] = await Promise.all(answers.map((answer) => answer.json()));

  const issued = bodies.flatMap(
    (body) => z.object({ access_token: z.string() }).safeParse(body).data?.access_token ?? [],
  );

  const verified = await Promise.all(issued.map((token) => ctx.auth.verify(token)));

  expect(ctx.countRows(tokens.grantID)).toStrictEqual({
    grants: 0,
    accessTokens: 0,
    refreshTokens: 0,
    sessions: 0,
  });

  expect(verified.every((access) => access === null)).toBeTrue();
  expect(ctx.revoked).toStrictEqual([tokens.grantID]);
});

test('#answerTokenRequest revokes nothing when another client presents a replaced refresh token', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });
  const stranger = await ctx.auth.clients.add('stranger', ['https://stranger.example/callback']);

  await ctx.refresh(tokens.clientID, tokens.refreshToken);
  await ctx.refresh(stranger.clientID, tokens.refreshToken);

  const grants = await ctx.auth.grants.list();

  expect(grants.map((grant) => grant.grantID)).toStrictEqual([tokens.grantID]);
  expect(ctx.revoked).toStrictEqual([]);
});

test('#answerTokenRequest issues a bearer token to a client that sends a DPoP header', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  const answer = await ctx.sendToken(
    {
      grant_type: 'refresh_token',
      client_id: tokens.clientID,
      refresh_token: tokens.refreshToken,
    },
    { dpop: 'not-a-proof' },
  );

  const answered: unknown = await answer.json();

  const body = z.object({ access_token: z.string(), token_type: z.string() }).parse(answered);

  const access = await ctx.auth.verify(body.access_token);

  expect(body.token_type).toBe('Bearer');
  expect(access).toMatchObject({ kind: 'oauth', grantID: tokens.grantID });
});

test('#answerTokenRequest records a refused exchange with its error code and client but no token', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await ctx.refresh(tokens.clientID, 'not-a-refresh-token');

  const event = ctx.events.at(-1);

  expect(event).toStrictEqual({
    kind: 'token_exchange',
    outcome: 'rejected',
    reason: 'invalid_grant',
    path: '/oauth2/token',
    requester: buildTestRequester(),
    client: { id: tokens.clientID, name: expect.any(String) },
  });
});

test('#answerTokenRequest records a succeeded exchange', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  await ctx.refresh(tokens.clientID, tokens.refreshToken);

  expect(ctx.events.at(-1)).toMatchObject({
    kind: 'token_exchange',
    outcome: 'succeeded',
    client: { id: tokens.clientID },
  });
});

test('#answerTokenRequest refuses a request with no body', async () => {
  const ctx = await setupTest();

  const answer = await ctx.auth.routes.token(
    new Request('https://app.example/oauth2/token', { method: 'POST' }),
    buildTestRequester(),
  );

  const body: unknown = await answer.json();

  expect(answer.status).toBe(400);
  expect(body).toMatchObject({ error: 'invalid_request' });
});

test('#answerTokenRequest ends the sessions of a grant once its tokens exist', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read'] });

  expect(ctx.countRows(tokens.grantID).sessions).toBe(0);
});
