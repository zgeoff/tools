import { expect, onTestFinished, test } from 'bun:test';
import { openMCPAuth } from '../open-mcp-auth.ts';
import { buildStubClock } from '../test-utils/build-stub-clock.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { createTestDatabase } from '../test-utils/create-test-database.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { readJSONRecord } from '../test-utils/read-json-record.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return {
    ...server,
    readServerMetadata: async () => {
      const answer = await server.auth.routes.authorizationServerMetadata(
        new Request('https://app.example/.well-known/oauth-authorization-server'),
        buildTestRequester(),
      );

      return { answer, body: await readJSONRecord(answer) };
    },
  };
}

test('#answerMetadataRequest advertises no introspection and no DPoP field', async () => {
  const ctx = await setupTest();
  const metadata = await ctx.readServerMetadata();

  const keys = Object.keys(metadata.body);

  expect(keys).toSatisfyAll((key: string) => !key.startsWith('introspection_'));
  expect(keys).toSatisfyAll((key: string) => !key.startsWith('dpop_'));
});

test('#answerMetadataRequest advertises public clients and the endpoints of the server', async () => {
  const ctx = await setupTest();
  const metadata = await ctx.readServerMetadata();

  expect(metadata.answer.headers.get('cache-control')).toBe('no-store');

  expect(metadata.body).toMatchObject({
    issuer: 'https://app.example',
    authorization_endpoint: 'https://app.example/oauth2/authorize',
    token_endpoint: 'https://app.example/oauth2/token',
    revocation_endpoint: 'https://app.example/oauth2/revoke',
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
  });
});

test('#answerMetadataRequest advertises the paths an app configures', async () => {
  const database = createTestDatabase();

  onTestFinished(() => {
    database.close();
  });

  const auth = await openMCPAuth({
    database,
    origin: 'https://app.example',
    productName: 'app',
    scopes: ['read'],
    paths: {
      browser: {
        authorize: '/web/authorize',
        login: '/web/login',
        enroll: '/web/enroll',
        consent: '/web/consent',
        error: '/web/error',
      },
      machine: {
        mcp: '/mcp',
        root: '/',
        token: '/api/token',
        revoke: '/api/revoke',
        authorizationServerMetadata: '/.well-known/oauth-authorization-server',
        resourceMetadata: '/.well-known/oauth-protected-resource',
        mcpResourceMetadata: '/.well-known/oauth-protected-resource/mcp',
      },
    },
    tables: { passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' },
    clock: buildStubClock(),
    security: { record: () => {} },
    onGrantRevoked: () => {},
  });

  onTestFinished(() => auth.close());

  const answer = await auth.routes.authorizationServerMetadata(
    new Request('https://app.example/.well-known/oauth-authorization-server'),
    buildTestRequester(),
  );

  const body = await readJSONRecord(answer);

  expect(body).toMatchObject({
    authorization_endpoint: 'https://app.example/web/authorize',
    token_endpoint: 'https://app.example/api/token',
    revocation_endpoint: 'https://app.example/api/revoke',
  });
});

test('#answerMetadataRequest names the product on the resource metadata', async () => {
  const ctx = await setupTest();

  const answer = await ctx.auth.routes.resourceMetadata(
    new Request('https://app.example/.well-known/oauth-protected-resource'),
    buildTestRequester(),
  );

  const body = await readJSONRecord(answer);

  expect(body).toMatchObject({ resource_name: 'app' });
});
