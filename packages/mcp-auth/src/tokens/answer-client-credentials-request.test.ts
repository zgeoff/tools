import { expect, onTestFinished, test } from 'bun:test';
import { toTagged } from '@zgeoff/std';
import { mintServiceSecret } from '../service-tokens/mint-service-secret.ts';
import { buildFormRequest } from '../test-utils/build-form-request.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { readJSONRecord } from '../test-utils/read-json-record.ts';
import type { OAuthClientID } from '../types.ts';

async function setupTest() {
  const first = mintServiceSecret();
  const second = mintServiceSecret();
  const third = mintServiceSecret();
  const staticToken = `svc_${'a'.repeat(32)}`;

  const server = await openTestAuth({
    serviceTokens: {
      prefix: 'svc_',
      file: {
        resource: 'https://app.example/mcp',
        clients: [
          {
            name: 'wringer-ro',
            scopes: ['read', 'write'],
            tokens: [],
            secretDigests: [first.digest, second.digest],
          },
          { name: 'ci', scopes: ['read'], tokens: [staticToken] },
          { name: 'other', scopes: ['read'], tokens: [], secretDigests: [third.digest] },
        ],
      },
    },
  });

  onTestFinished(() => server.close());

  const send = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
    server.auth.routes.token(
      buildFormRequest('https://app.example/oauth2/token', new URLSearchParams(fields), headers),
      buildTestRequester(),
    );

  return {
    ...server,
    first,
    second,
    third,
    send,
    basicHeader: (clientID: string, secret: string): Record<string, string> => ({
      authorization: `Basic ${btoa(`${clientID}:${secret}`)}`,
    }),
    sendBasic: (clientID: string, secret: string, fields = new URLSearchParams()) =>
      server.auth.routes.token(
        buildFormRequest(
          'https://app.example/oauth2/token',
          new URLSearchParams([['grant_type', 'client_credentials'], ...fields]),
          { authorization: `Basic ${btoa(`${clientID}:${secret}`)}` },
        ),
        buildTestRequester(),
      ),
    sendGrant: (fields: Record<string, string> = {}, secret: string = first.secret) =>
      send(
        { grant_type: 'client_credentials', ...fields },
        { authorization: `Basic ${btoa(`service:wringer-ro:${secret}`)}` },
      ),
  };
}

test('#answerClientCredentialsRequest issues a token with every scope of the client', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant();
  const body = await readJSONRecord(answer);

  expect(answer.status).toBe(200);
  expect(answer.headers.get('cache-control')).toBe('no-store');

  expect(body).toStrictEqual({
    access_token: expect.stringMatching(/^svca_[A-Za-z0-9_-]{43}$/u),
    token_type: 'Bearer',
    expires_in: 600,
    scope: 'read write',
  });
});

test('#answerClientCredentialsRequest accepts a client ID that the header form-encodes', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendBasic('service%3Awringer-ro', ctx.first.secret);

  expect(answer.status).toBe(200);
});

test('#answerClientCredentialsRequest accepts a body client_id that equals the header ID', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant({ client_id: 'service:wringer-ro' });

  expect(answer.status).toBe(200);
});

test('#answerClientCredentialsRequest accepts either secret during a rotation', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant({}, ctx.second.secret);

  expect(answer.status).toBe(200);
});

type TestContext = Awaited<ReturnType<typeof setupTest>>;

interface Rejection {
  headers: Record<string, string>;
  fields: Record<string, string>;
}

test.each<[string, (ctx: TestContext) => Rejection]>([
  ['a request with no client authentication', () => ({ headers: {}, fields: {} })],
  ['a malformed header', () => ({ headers: { authorization: 'Basic' }, fields: {} })],
  [
    'a header with no colon',
    () => ({ headers: { authorization: `Basic ${btoa('service:wringer-ro')}` }, fields: {} }),
  ],
  [
    'a header with an empty secret',
    (ctx) => ({ headers: ctx.basicHeader('service:wringer-ro', ''), fields: {} }),
  ],
  [
    'a bearer header',
    (ctx) => ({ headers: { authorization: `Bearer ${ctx.first.secret}` }, fields: {} }),
  ],
  [
    'an unknown client that presents a real secret',
    (ctx) => ({ headers: ctx.basicHeader('service:nobody', ctx.first.secret), fields: {} }),
  ],
  [
    'a client with no secret digest that presents a real secret',
    (ctx) => ({ headers: ctx.basicHeader('service:ci', ctx.first.secret), fields: {} }),
  ],
  [
    'a wrong secret',
    (ctx) => ({ headers: ctx.basicHeader('service:wringer-ro', 'svcs_wrong'), fields: {} }),
  ],
  [
    "another client's secret presented with this client's ID",
    (ctx) => ({ headers: ctx.basicHeader('service:wringer-ro', ctx.third.secret), fields: {} }),
  ],
  [
    'a client_secret in the body beside a valid header',
    (ctx) => ({
      headers: ctx.basicHeader('service:wringer-ro', ctx.first.secret),
      fields: { client_secret: ctx.first.secret },
    }),
  ],
  [
    'a client_assertion in the body beside a valid header',
    (ctx) => ({
      headers: ctx.basicHeader('service:wringer-ro', ctx.first.secret),
      fields: { client_assertion: 'x' },
    }),
  ],
  [
    'a body client_id other than the header ID',
    (ctx) => ({
      headers: ctx.basicHeader('service:wringer-ro', ctx.first.secret),
      fields: { client_id: 'service:other' },
    }),
  ],
])('#answerClientCredentialsRequest answers 401 invalid_client to %s', async (_title, build) => {
  const ctx = await setupTest();

  const rejection = build(ctx);

  const answer = await ctx.send(
    { grant_type: 'client_credentials', ...rejection.fields },
    rejection.headers,
  );

  const body = await readJSONRecord(answer);

  expect(answer.status).toBe(401);
  expect(body['error']).toBe('invalid_client');
  expect(answer.headers.get('www-authenticate')).toBe('Basic realm="https://app.example"');
  expect(answer.headers.get('cache-control')).toBe('no-store');
});

test('#answerClientCredentialsRequest refuses both client_secret_post and a header together', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant({ client_secret: ctx.first.secret });

  expect(answer.status).toBe(401);
});

test('#answerClientCredentialsRequest issues the requested subset of scopes', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant({ scope: 'write read write' });
  const body = await readJSONRecord(answer);

  expect(body['scope']).toBe('write read');
});

test('#answerClientCredentialsRequest answers 400 invalid_scope to a scope the client lacks', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant({ scope: 'read admin' });
  const body = await readJSONRecord(answer);

  expect(answer.status).toBe(400);
  expect(body['error']).toBe('invalid_scope');
});

test.each([
  ['no resource', []],
  ['the server resource', ['https://app.example/mcp']],
])('#answerClientCredentialsRequest accepts %s', async (_title, resources) => {
  const ctx = await setupTest();

  const fields = new URLSearchParams();

  for (const resource of resources) {
    fields.append('resource', resource);
  }

  const answer = await ctx.sendBasic('service:wringer-ro', ctx.first.secret, fields);

  expect(answer.status).toBe(200);
});

test.each([
  ['another resource', ['https://other.example/mcp']],
  ['a repeated resource', ['https://app.example/mcp', 'https://app.example/mcp']],
])(
  '#answerClientCredentialsRequest answers 400 invalid_target to %s',
  async (_title, resources) => {
    const ctx = await setupTest();

    const fields = new URLSearchParams();

    for (const resource of resources) {
      fields.append('resource', resource);
    }

    const answer = await ctx.sendBasic('service:wringer-ro', ctx.first.secret, fields);
    const body = await readJSONRecord(answer);

    expect(answer.status).toBe(400);
    expect(body['error']).toBe('invalid_target');
  },
);

test('#answerClientCredentialsRequest answers 400 unsupported_grant_type when no client holds a secret', async () => {
  const server = await openTestAuth({
    serviceTokens: {
      prefix: 'svc_',
      file: {
        resource: 'https://app.example/mcp',
        clients: [{ name: 'ci', scopes: ['read'], tokens: [`svc_${'a'.repeat(32)}`] }],
      },
    },
  });

  onTestFinished(() => server.close());

  const answer = await server.auth.routes.token(
    buildFormRequest(
      'https://app.example/oauth2/token',
      new URLSearchParams({ grant_type: 'client_credentials' }),
    ),
    buildTestRequester(),
  );

  const body = await readJSONRecord(answer);

  expect(answer.status).toBe(400);
  expect(body['error']).toBe('unsupported_grant_type');
});

test('#answerClientCredentialsRequest answers 400 unsupported_grant_type when the app passes no service tokens', async () => {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  const answer = await server.auth.routes.token(
    buildFormRequest(
      'https://app.example/oauth2/token',
      new URLSearchParams({ grant_type: 'client_credentials' }),
    ),
    buildTestRequester(),
  );

  const body = await readJSONRecord(answer);

  expect(body['error']).toBe('unsupported_grant_type');
});

test('#answerClientCredentialsRequest lets the token verify as service access', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant({ scope: 'read' });
  const body = await readJSONRecord(answer);
  const access = await ctx.auth.verify(String(body['access_token']));

  expect(access).toStrictEqual({
    kind: 'service',
    clientID: 'service:wringer-ro',
    clientName: 'service:wringer-ro',
    scopes: ['read'],
  });
});

test('#answerClientCredentialsRequest issues a token that expires after 600 seconds', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant();
  const body = await readJSONRecord(answer);

  const token = String(body['access_token']);

  ctx.clock.advance(599_000);

  const before = await ctx.auth.verify(token);

  ctx.clock.advance(1000);

  const after = await ctx.auth.verify(token);

  expect(before).not.toBeNull();
  expect(after).toBeNull();
});

test('#answerClientCredentialsRequest answers 503 temporarily_unavailable at 1000 live tokens', async () => {
  const ctx = await setupTest();

  for (let issued = 0; issued < 1000; issued += 1) {
    await ctx.sendGrant();
  }

  const answer = await ctx.sendGrant();
  const body = await readJSONRecord(answer);

  expect(answer.status).toBe(503);
  expect(body['error']).toBe('temporarily_unavailable');
});

test('#answerClientCredentialsRequest drops expired tokens at the cap before it refuses', async () => {
  const ctx = await setupTest();

  for (let issued = 0; issued < 1000; issued += 1) {
    await ctx.sendGrant();
  }

  ctx.clock.advance(600_000);

  const answer = await ctx.sendGrant();

  expect(answer.status).toBe(200);
});

test('#answerClientCredentialsRequest records one succeeded event with the client and no secret', async () => {
  const ctx = await setupTest();
  const answer = await ctx.sendGrant();
  const body = await readJSONRecord(answer);

  expect(ctx.events).toStrictEqual([
    {
      kind: 'token_exchange',
      outcome: 'succeeded',
      path: '/oauth2/token',
      requester: buildTestRequester(),
      client: { id: toTagged<OAuthClientID>('service:wringer-ro'), name: 'service:wringer-ro' },
    },
  ]);

  const logged = JSON.stringify(ctx.events);

  expect(logged).not.toInclude(ctx.first.secret);
  expect(logged).not.toInclude(String(body['access_token']));
});

test('#answerClientCredentialsRequest records one rejected event with the reason and no secret', async () => {
  const ctx = await setupTest();

  await ctx.sendGrant({}, 'svcs_wrong');

  expect(ctx.events).toStrictEqual([
    {
      kind: 'token_exchange',
      outcome: 'rejected',
      reason: 'invalid_client',
      path: '/oauth2/token',
      requester: buildTestRequester(),
      client: { id: toTagged<OAuthClientID>('service:wringer-ro'), name: 'service:wringer-ro' },
    },
  ]);

  expect(JSON.stringify(ctx.events)).not.toInclude('svcs_wrong');
});

test('#answerClientCredentialsRequest records no client for an ID the file lacks', async () => {
  const ctx = await setupTest();

  await ctx.sendBasic('service:nobody', ctx.first.secret);

  expect(ctx.events).toStrictEqual([
    {
      kind: 'token_exchange',
      outcome: 'rejected',
      reason: 'invalid_client',
      path: '/oauth2/token',
      requester: buildTestRequester(),
    },
  ]);
});
