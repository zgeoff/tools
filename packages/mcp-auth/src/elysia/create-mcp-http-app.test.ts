import { expect, mock, onTestFinished, test } from 'bun:test';
import { Elysia } from 'elysia';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import type { Access, ServiceTokenFile } from '../types.ts';
import { createMCPHTTPApp } from './create-mcp-http-app.ts';

async function setupTest(besidePrefix = '/api') {
  const serviceToken = `svc_${'a'.repeat(40)}`;

  const file: ServiceTokenFile<'read' | 'write'> = {
    resource: 'https://app.example/mcp',
    clients: [{ name: 'ci', scopes: ['read'], tokens: [serviceToken] }],
  };

  const server = await openTestAuth({ serviceTokens: { prefix: 'svc_', file } });

  onTestFinished(() => server.close());

  const fetchMCP = mock<
    (request: Request, access: Access<'read' | 'write', null>) => Promise<Response>
  >(() => Promise.resolve(new Response('mcp answered', { status: 200 })));

  const adapter = createMCPHTTPApp({
    auth: server.auth,
    hosts: new Set(['app.example']),
    origins: new Set(['https://app.example']),
    readRequester: () => buildTestRequester(),
    security: {
      record: (event) => {
        server.events.push(event);
      },
    },
    mcp: { fetch: fetchMCP },
    besidePrefix,
  });

  // The app's own route goes first, so an adapter route on the same path would replace it.
  const app = new Elysia()
    .all(besidePrefix, () => 'app answer')
    .use(adapter)
    .get('/api/ping', () => 'pong')
    .get('/other', () => 'other');

  return {
    serviceToken,
    server,
    fetchMCP,
    sendRequest: (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);

      if (!headers.has('host')) {
        headers.set('host', 'app.example');
      }

      return app.handle(new Request(`https://app.example${path}`, { ...init, headers }));
    },
  };
}

test('it refuses a request whose Host header the app does not serve, and records bad_host', async () => {
  const ctx = await setupTest();

  const answered = await ctx.sendRequest('/mcp', {
    method: 'POST',
    headers: { host: 'rebound.example' },
  });

  expect(answered.status).toBe(403);

  expect(ctx.server.events).toStrictEqual([
    {
      kind: 'bad_host',
      outcome: 'rejected',
      reason: 'host_not_allowed',
      path: '/mcp',
      requester: buildTestRequester(),
    },
  ]);

  expect(ctx.fetchMCP).not.toHaveBeenCalled();
});

test('it refuses a POST whose Origin header is not allowed, and records bad_origin', async () => {
  const ctx = await setupTest();

  const answered = await ctx.sendRequest('/mcp', {
    method: 'POST',
    headers: { origin: 'https://evil.example' },
  });

  expect(answered.status).toBe(403);

  expect(ctx.server.events).toStrictEqual([
    {
      kind: 'bad_origin',
      outcome: 'rejected',
      reason: 'origin_not_allowed',
      path: '/mcp',
      requester: buildTestRequester(),
    },
  ]);
});

test('it refuses a form POST that carries no Origin header', async () => {
  const ctx = await setupTest();
  const answered = await ctx.sendRequest('/login', { method: 'POST', body: new URLSearchParams() });

  expect(answered.status).toBe(403);
  expect(ctx.server.events.map((event) => event.kind)).toStrictEqual(['bad_origin']);
});

test('it lets a GET through with no Origin header', async () => {
  const ctx = await setupTest();
  const answered = await ctx.sendRequest('/.well-known/oauth-authorization-server');

  expect(answered.status).toBe(200);
  expect(ctx.server.events).toStrictEqual([]);
});

test('it answers 401 with a resource metadata challenge and records a bearer event when the request has no Authorization header', async () => {
  const ctx = await setupTest();
  const answered = await ctx.sendRequest('/mcp', { method: 'POST' });

  expect([answered.status, answered.headers.get('www-authenticate')]).toStrictEqual([
    401,
    'Bearer resource_metadata="https://app.example/.well-known/oauth-protected-resource/mcp"',
  ]);

  expect(ctx.server.events).toStrictEqual([
    expect.objectContaining({
      kind: 'bearer',
      outcome: 'rejected',
      reason: 'missing',
      path: '/mcp',
    }),
  ]);
});

test('it records a bearer event for an Authorization header that holds no bearer token', async () => {
  const ctx = await setupTest();

  const answered = await ctx.sendRequest('/mcp', {
    method: 'POST',
    headers: { authorization: 'Basic abc' },
  });

  expect(answered.status).toBe(401);

  expect(ctx.server.events).toStrictEqual([
    {
      kind: 'bearer',
      outcome: 'rejected',
      reason: 'malformed',
      path: '/mcp',
      requester: buildTestRequester(),
    },
  ]);
});

test('it answers 401 invalid_token for an unknown bearer token, and never reaches MCP', async () => {
  const ctx = await setupTest();

  const answered = await ctx.sendRequest('/', {
    method: 'POST',
    headers: { authorization: 'Bearer nope' },
  });

  expect([answered.status, answered.headers.get('www-authenticate')]).toStrictEqual([
    401,
    'Bearer error="invalid_token", resource_metadata="https://app.example/.well-known/oauth-protected-resource/mcp"',
  ]);

  expect(ctx.server.events).toStrictEqual([
    {
      kind: 'bearer',
      outcome: 'rejected',
      reason: 'invalid_token',
      path: '/',
      requester: buildTestRequester(),
    },
  ]);

  expect(ctx.fetchMCP).not.toHaveBeenCalled();
});

test('it hands an OAuth access token to the MCP handler with the grant behind it', async () => {
  const ctx = await setupTest();
  const authorized = await authorizeTestClient(ctx.server.auth, { scopes: ['read'] });

  const answered = await ctx.sendRequest('/mcp', {
    method: 'POST',
    headers: { authorization: `Bearer ${authorized.accessToken}` },
  });

  const body = await answered.text();

  expect(body).toBe('mcp answered');

  expect(ctx.fetchMCP).toHaveBeenCalledExactlyOnceWith(expect.any(Request), {
    kind: 'oauth',
    grantID: authorized.grantID,
    clientID: authorized.clientID,
    clientName: expect.any(String),
    scopes: ['read'],
    limits: null,
  });
});

test('it hands a service token to the MCP handler as a service access', async () => {
  const ctx = await setupTest();

  await ctx.sendRequest('/', {
    method: 'POST',
    headers: { authorization: `Bearer ${ctx.serviceToken}` },
  });

  expect(ctx.fetchMCP).toHaveBeenCalledExactlyOnceWith(expect.any(Request), {
    kind: 'service',
    clientID: 'service:ci',
    clientName: 'service:ci',
    scopes: ['read'],
  });
});

test('it serves the resource metadata at both paths', async () => {
  const ctx = await setupTest();
  const plain = await ctx.sendRequest('/.well-known/oauth-protected-resource');
  const forMCP = await ctx.sendRequest('/.well-known/oauth-protected-resource/mcp');

  expect([plain.status, forMCP.status]).toStrictEqual([200, 200]);

  const plainBody = await plain.json();
  const forMCPBody = await forMCP.json();

  expect(forMCPBody).toStrictEqual(plainBody);
});

test('it serves the authorize page and the error page through the core routes', async () => {
  const ctx = await setupTest();
  const login = await ctx.sendRequest('/login');
  const failed = await ctx.sendRequest('/error?error=access_denied');

  expect([login.status, failed.status]).toStrictEqual([expect.any(Number), 400]);
  expect(login.headers.get('content-type')).toStartWith('text/html');
});

test('it leaves a path under besidePrefix to the app, with no Host check', async () => {
  const ctx = await setupTest();
  const answered = await ctx.sendRequest('/api/ping', { headers: { host: 'rebound.example' } });
  const body = await answered.text();

  expect(body).toBe('pong');
  expect(ctx.server.events).toStrictEqual([]);
});

test('it checks the Host header of a path outside besidePrefix that the app serves', async () => {
  const ctx = await setupTest();
  const answered = await ctx.sendRequest('/other', { headers: { host: 'rebound.example' } });

  expect(answered.status).toBe(403);
});

test('it answers no unknown path, so the app gives its own 404', async () => {
  const ctx = await setupTest();
  const answered = await ctx.sendRequest('/nowhere');

  expect(answered.status).toBe(404);
});

test('it serves no MCP request under besidePrefix, so a rebound Host never reaches MCP', async () => {
  const ctx = await setupTest('/mcp');

  const answered = await ctx.sendRequest('/mcp', {
    method: 'POST',
    headers: { host: 'rebound.example', authorization: `Bearer ${ctx.serviceToken}` },
  });

  const body = await answered.text();

  expect(body).toBe('app answer');
  expect(ctx.fetchMCP).not.toHaveBeenCalled();
});

test('it serves no resource metadata path under besidePrefix', async () => {
  const ctx = await setupTest('/.well-known/oauth-protected-resource/mcp');

  const answered = await ctx.sendRequest('/.well-known/oauth-protected-resource/mcp', {
    headers: { host: 'rebound.example' },
  });

  const body = await answered.text();

  expect(body).toBe('app answer');
});
