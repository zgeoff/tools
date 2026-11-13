import { expect, onTestFinished, test } from 'bun:test';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return server;
}

test('#clients.add stores a client with a random ID and lists it', async () => {
  const ctx = await setupTest();
  const added = await ctx.auth.clients.add('Claude', ['https://assistant.example/callback']);
  const listed = await ctx.auth.clients.list();

  expect(added).toStrictEqual({
    clientID: expect.stringMatching(/^[A-Za-z0-9]{32}$/u),
    name: 'Claude',
    redirectURIs: ['https://assistant.example/callback'],
    createdAt: expect.any(String),
  });

  expect(listed).toStrictEqual([added]);
});

test('#clients.add cleans the name before it stores it', async () => {
  const ctx = await setupTest();

  const added = await ctx.auth.clients.add(`  My \t\n  client\u0007 ${'x'.repeat(120)}`, [
    'https://assistant.example/callback',
  ]);

  expect(added.name).toBe(`My client ${'x'.repeat(90)}`);
});

test('#clients.add refuses a name that is empty after cleaning', async () => {
  const ctx = await setupTest();

  const added = ctx.auth.clients.add(' \u0007 ', ['https://assistant.example/callback']);

  expect(added).rejects.toMatchObject({ code: 'invalid-client-name' });
});

test('#clients.add refuses a name that is taken', async () => {
  const ctx = await setupTest();

  await ctx.auth.clients.add('Claude', ['https://assistant.example/callback']);

  const added = ctx.auth.clients.add(' Claude ', ['https://other.example/callback']);

  expect(added).rejects.toMatchObject({ code: 'conflict' });
});

test.each([
  ['an http URI on a host that is not loopback', 'http://assistant.example/callback'],
  ['a URI with a fragment', 'https://assistant.example/callback#fragment'],
  ['a URI with user info', 'https://user:pass@assistant.example/callback'],
  ['a URI that is no URL', 'not a url'],
])('#clients.add refuses %s', async (_title, uri) => {
  const ctx = await setupTest();

  const added = ctx.auth.clients.add('Claude', [uri]);

  expect(added).rejects.toMatchObject({ code: 'invalid-redirect-uri' });
});

test('#clients.add refuses a client with no redirect URI', async () => {
  const ctx = await setupTest();

  const added = ctx.auth.clients.add('Claude', []);

  expect(added).rejects.toMatchObject({ code: 'invalid-redirect-uri' });
});

test('#clients.add accepts an http redirect URI on a loopback host', async () => {
  const ctx = await setupTest();
  const added = await ctx.auth.clients.add('Desktop', ['http://127.0.0.1:33418/callback']);

  expect(added.redirectURIs).toStrictEqual(['http://127.0.0.1:33418/callback']);
});

test('#clients.update replaces the redirect URIs of the client with that name', async () => {
  const ctx = await setupTest();

  await ctx.auth.clients.add('Claude', ['https://assistant.example/callback']);

  const updated = await ctx.auth.clients.update('  Claude', ['https://assistant.example/v2']);
  const listed = await ctx.auth.clients.list();

  expect(updated.redirectURIs).toStrictEqual(['https://assistant.example/v2']);
  expect(listed).toStrictEqual([updated]);
});

test('#clients.update refuses a name no client has', async () => {
  const ctx = await setupTest();

  const updated = ctx.auth.clients.update('Nobody', ['https://assistant.example/callback']);

  expect(updated).rejects.toMatchObject({ code: 'not-found' });
});

test('#clients.update refuses a redirect URI that is not allowed', async () => {
  const ctx = await setupTest();

  await ctx.auth.clients.add('Claude', ['https://assistant.example/callback']);

  const updated = ctx.auth.clients.update('Claude', ['http://assistant.example/callback']);

  expect(updated).rejects.toMatchObject({ code: 'invalid-redirect-uri' });
});

test('#clients.remove revokes each grant of the client and reports how many', async () => {
  const ctx = await setupTest();
  const first = await authorizeTestClient(ctx.auth, { scopes: ['read'] });
  const second = await authorizeTestClient(ctx.auth, { scopes: ['read'] });
  const clients = await ctx.auth.clients.list();

  const firstClient = clients.find((client) => client.clientID === first.clientID);

  if (firstClient === undefined) {
    throw new Error('the client is missing');
  }

  const revoked = await ctx.auth.clients.remove(firstClient.name);
  const grants = await ctx.auth.grants.list();
  const access = await ctx.auth.verify(first.accessToken);

  expect(revoked).toBe(1);
  expect(ctx.revoked).toStrictEqual([first.grantID]);
  expect(grants.map((grant) => grant.grantID)).toStrictEqual([second.grantID]);
  expect(access).toBeNull();
});

test('#clients.remove refuses a name no client has', async () => {
  const ctx = await setupTest();

  const removed = ctx.auth.clients.remove('Nobody');

  expect(removed).rejects.toMatchObject({ code: 'not-found' });
});

test('#clients.remove cleans the name the same way as add', async () => {
  const ctx = await setupTest();

  await ctx.auth.clients.add('Claude', ['https://assistant.example/callback']);

  const revoked = await ctx.auth.clients.remove('  Claude\u0007 ');
  const listed = await ctx.auth.clients.list();

  expect(revoked).toBe(0);
  expect(listed).toStrictEqual([]);
});
