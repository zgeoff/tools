import { expect, onTestFinished, test } from 'bun:test';
import { DEFAULT_PATHS } from './default-paths.ts';
import { openMCPAuth } from './open-mcp-auth.ts';
import { authorizeTestClient } from './test-utils/authorize-test-client.ts';
import { buildStubClock } from './test-utils/build-stub-clock.ts';
import { createTestDatabase } from './test-utils/create-test-database.ts';
import { openTestAuth } from './test-utils/open-test-auth.ts';

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

  return { ...server, serviceToken };
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
