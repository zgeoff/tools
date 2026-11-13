import { expect, onTestFinished, test } from 'bun:test';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely, sql } from 'kysely';
import { DEFAULT_PATHS } from './default-paths.ts';
import { openMCPAuth } from './open-mcp-auth.ts';
import { authorizeTestClient } from './test-utils/authorize-test-client.ts';
import { buildFormRequest } from './test-utils/build-form-request.ts';
import { buildStubClock } from './test-utils/build-stub-clock.ts';
import { buildTestRequester } from './test-utils/build-test-requester.ts';
import { createTestDatabase } from './test-utils/create-test-database.ts';
import { hookSQLiteStatements } from './test-utils/hook-sqlite-statements.ts';
import { openTestAuth } from './test-utils/open-test-auth.ts';

// What an app's own Kysely holds: a typed database of its own tables.
interface AppSchema {
  readonly notes: { readonly id: string };
}

async function setupTest() {
  const serviceToken = `svc_${'a'.repeat(32)}`;

  const server = await openTestAuth({
    serviceTokens: {
      prefix: 'svc_',
      file: {
        resource: 'https://app.example/mcp',
        clients: [{ name: 'ci', scopes: ['read'], tokens: [serviceToken] }],
      },
    },
  });

  onTestFinished(() => server.close());

  const database = createTestDatabase();

  // Armed once the app transaction is open: from then on, a write that reaches
  // sqlite or a query the app Kysely compiles is the core attempting its change.
  const attempt = Promise.withResolvers<void>();
  let armed = false;

  const signalAttempt = () => {
    if (armed) {
      attempt.resolve();
    }
  };

  hookSQLiteStatements(database, (statement) => {
    if (/^\s*(?:insert|update|delete)\b/iu.test(statement)) {
      signalAttempt();
    }
  });

  const app = new Kysely<AppSchema>({
    dialect: buildSQLiteDialect(database),
    plugins: [
      {
        transformQuery: (args) => {
          signalAttempt();

          return args.node;
        },
        transformResult: (args) => Promise.resolve(args.result),
      },
    ],
  });

  onTestFinished(() => app.destroy());

  // The core opens over the app's Kysely when it is given, else over the
  // Database alone.
  // oxlint-disable-next-line typescript/no-explicit-any -- an app's Kysely is typed with its own tables
  const openGranted = async (appKysely?: Kysely<any>) => {
    const opened = await openTestAuth({ database, appKysely });

    onTestFinished(() => opened.close());

    const grant = await authorizeTestClient(opened.auth, { scopes: ['read'] });

    const refresh = (refreshToken: string) =>
      opened.auth.routes.token(
        buildFormRequest(
          `${opened.auth.issuer}${opened.auth.paths.machine.token}`,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: grant.clientID,
            resource: opened.auth.resource,
          }),
        ),
        buildTestRequester(),
      );

    return { ...opened, grant, refresh };
  };

  // An app transaction that awaits I/O after its first statement, then fails.
  const openFailingTransaction = async () => {
    const inside = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();

    const settled = (async () => {
      try {
        await app.transaction().execute(async (trx) => {
          await sql`select 1`.execute(trx);

          inside.resolve();

          await release.promise;

          throw new Error('the app rolls back');
        });

        return 'committed';
      } catch {
        return 'rolled back';
      }
    })();

    await inside.promise;

    armed = true;

    return {
      // Rolls back only after the core has attempted its write, so a core
      // that does not wait for the app transaction loses the write.
      rollBack: async () => {
        await attempt.promise;

        release.resolve();

        return settled;
      },
    };
  };

  return { ...server, serviceToken, database, app, openGranted, openFailingTransaction };
}

test('#openMCPAuth refuses a service token file that names another resource', () => {
  const database = createTestDatabase();

  onTestFinished(() => {
    database.close();
  });

  const opened = openMCPAuth({
    database,
    origin: 'https://app.example',
    productName: 'app',
    scopes: ['read'],
    paths: DEFAULT_PATHS,
    tables: { passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' },
    clock: buildStubClock(),
    security: { record: () => {} },
    onGrantRevoked: () => {},
    serviceTokens: {
      prefix: 'svc_',
      file: { resource: 'https://elsewhere.example/mcp', clients: [] },
    },
  });

  expect(opened).rejects.toMatchObject({ code: 'invalid-setup' });
});

test('#verify gives a service token the access of its client', async () => {
  const ctx = await setupTest();
  const access = await ctx.auth.verify(ctx.serviceToken);

  expect(access).toStrictEqual({
    kind: 'service',
    clientID: 'service:ci',
    clientName: 'service:ci',
    scopes: ['read'],
  });
});

test('#verify checks a token without the service prefix against the database', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['write'] });
  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toMatchObject({ kind: 'oauth', scopes: ['write'] });
});

test('#verify returns null for a token with the service prefix that the file lacks', async () => {
  const ctx = await setupTest();
  const access = await ctx.auth.verify(`svc_${'z'.repeat(32)}`);

  expect(access).toBeNull();
});

test('#findClientScopes returns the scopes of a service client', async () => {
  const ctx = await setupTest();
  const scopes = await ctx.auth.findClientScopes('service:ci');

  expect(scopes).toStrictEqual(['read']);
});

test('#findClientScopes returns the scopes an OAuth client holds, and null when it holds none', async () => {
  const ctx = await setupTest();
  const tokens = await authorizeTestClient(ctx.auth, { scopes: ['read', 'write'] });
  const stranger = await ctx.auth.clients.add('stranger', ['https://stranger.example/callback']);
  const held = await ctx.auth.findClientScopes(tokens.clientID);
  const none = await ctx.auth.findClientScopes(stranger.clientID);

  expect(held).toStrictEqual(['read', 'write']);
  expect(none).toBeNull();
});

test('#grants.list never lists a service client', async () => {
  const ctx = await setupTest();

  await ctx.auth.verify(ctx.serviceToken);

  const grants = await ctx.auth.grants.list();

  expect(grants).toStrictEqual([]);
});

test('#resource joins the origin and the MCP path', async () => {
  const ctx = await setupTest();

  expect(ctx.auth.resource).toBe('https://app.example/mcp');
  expect(ctx.auth.issuer).toBe('https://app.example');
});

test('#openMCPAuth with the app Kysely keeps a revoke made during an app transaction after its rollback', async () => {
  const ctx = await setupTest();
  const server = await ctx.openGranted(ctx.app);
  const transaction = await ctx.openFailingTransaction();

  const revoking = server.auth.grants.revoke(server.grant.grantID);

  const outcome = await transaction.rollBack();

  await revoking;

  const access = await server.auth.verify(server.grant.accessToken);

  expect(outcome).toBe('rolled back');
  expect(access).toBeNull();
});

test('#openMCPAuth with the app Kysely keeps a refresh made during an app transaction after its rollback', async () => {
  const ctx = await setupTest();
  const server = await ctx.openGranted(ctx.app);
  const transaction = await ctx.openFailingTransaction();

  const refreshing = server.refresh(server.grant.refreshToken);

  const outcome = await transaction.rollBack();
  const answered = await refreshing;
  const again = await server.refresh(server.grant.refreshToken);

  expect(outcome).toBe('rolled back');
  expect(answered.status).toBe(200);
  expect(again.status).toBe(400);
});

test('#openMCPAuth with a Database that another Kysely shares loses a revoke to that Kysely rollback', async () => {
  const ctx = await setupTest();
  const server = await ctx.openGranted();
  const transaction = await ctx.openFailingTransaction();

  await server.auth.grants.revoke(server.grant.grantID);
  await transaction.rollBack();

  const access = await server.auth.verify(server.grant.accessToken);

  expect(access).toMatchObject({ kind: 'oauth' });
});

test('#openMCPAuth with a Database that another Kysely shares loses a refresh to that Kysely rollback', async () => {
  const ctx = await setupTest();
  const server = await ctx.openGranted();
  const transaction = await ctx.openFailingTransaction();
  const answered = await server.refresh(server.grant.refreshToken);

  await transaction.rollBack();

  const again = await server.refresh(server.grant.refreshToken);

  expect(answered.status).toBe(200);
  expect(again.status).toBe(200);
});

test('#close leaves the app Kysely running', async () => {
  const ctx = await setupTest();
  const server = await ctx.openGranted(ctx.app);

  await server.auth.close();

  const result = await sql`select 1 as one`.execute(ctx.app);

  expect(result.rows).toStrictEqual([{ one: 1 }]);
});

test('#openMCPAuth with the app Kysely refuses a connection in a transaction, where foreign keys are off', async () => {
  const database = createTestDatabase();

  const app = new Kysely<AppSchema>({ dialect: buildSQLiteDialect(database) });

  onTestFinished(() => app.destroy());

  database.run('begin');

  const opened = openTestAuth({ database, appKysely: app });

  await expect(opened).rejects.toMatchObject({ code: 'invalid-setup' });
});
