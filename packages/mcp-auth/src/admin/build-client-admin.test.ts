import { expect, onTestFinished, test } from 'bun:test';
import { toTagged } from '@zgeoff/std';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import type { OAuthClientID } from '../types.ts';

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

test('#clients.update replaces the redirect URIs of the client with that ID', async () => {
  const ctx = await setupTest();
  const added = await ctx.auth.clients.add('Claude', ['https://assistant.example/callback']);
  const updated = await ctx.auth.clients.update(added.clientID, ['https://assistant.example/v2']);
  const listed = await ctx.auth.clients.list();

  expect(updated.redirectURIs).toStrictEqual(['https://assistant.example/v2']);
  expect(listed).toStrictEqual([updated]);
});

test('#clients.update refuses an ID no client has', async () => {
  const ctx = await setupTest();

  const updated = ctx.auth.clients.update(toTagged<OAuthClientID>('nobody'), [
    'https://assistant.example/callback',
  ]);

  expect(updated).rejects.toMatchObject({ code: 'not-found' });
});

test('#clients.update refuses a redirect URI that is not allowed', async () => {
  const ctx = await setupTest();
  const added = await ctx.auth.clients.add('Claude', ['https://assistant.example/callback']);

  const updated = ctx.auth.clients.update(added.clientID, ['http://assistant.example/callback']);

  expect(updated).rejects.toMatchObject({ code: 'invalid-redirect-uri' });
});

test('#clients.remove revokes each grant of the client and reports how many', async () => {
  const ctx = await setupTest();
  const first = await authorizeTestClient(ctx.auth, { scopes: ['read'] });
  const second = await authorizeTestClient(ctx.auth, { scopes: ['read'] });
  const revoked = await ctx.auth.clients.remove(first.clientID);
  const grants = await ctx.auth.grants.list();
  const access = await ctx.auth.verify(first.accessToken);

  expect(revoked).toBe(1);
  expect(ctx.revoked).toStrictEqual([first.grantID]);
  expect(grants.map((grant) => grant.grantID)).toStrictEqual([second.grantID]);
  expect(access).toBeNull();
});

test('#clients.remove refuses an ID no client has', async () => {
  const ctx = await setupTest();

  const removed = ctx.auth.clients.remove(toTagged<OAuthClientID>('nobody'));

  expect(removed).rejects.toMatchObject({ code: 'not-found' });
});

test('#clients.remove leaves a client whose name cleans to the same text', async () => {
  const ctx = await setupTest();

  ctx.database.run(
    `insert into oauthClient (id, clientId, name, redirectUris, scopes, clientCredentialsScopes, tokenEndpointAuthMethod, grantTypes, responseTypes, applicationType, requirePKCE, disabled, createdAt, updatedAt)
     values ('row-1', 'client-one', '  Spaced' || char(9) || 'Orchard  ', '["https://one.example/callback"]', '[]', '[]', 'none', '[]', '[]', 'web', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
            ('row-2', 'client-two', 'Spaced Orchard', '["https://two.example/callback"]', '[]', '[]', 'none', '[]', '[]', 'web', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );

  await ctx.auth.clients.remove(toTagged<OAuthClientID>('client-one'));

  const listed = await ctx.auth.clients.list();

  expect(listed.map((client) => client.clientID)).toStrictEqual([
    toTagged<OAuthClientID>('client-two'),
  ]);
});

test('#clients.readByName returns each client whose name cleans to the given name', async () => {
  const ctx = await setupTest();

  ctx.database.run(
    `insert into oauthClient (id, clientId, name, redirectUris, scopes, clientCredentialsScopes, tokenEndpointAuthMethod, grantTypes, responseTypes, applicationType, requirePKCE, disabled, createdAt, updatedAt)
     values ('row-1', 'client-one', '  Spaced' || char(9) || 'Orchard  ', '[]', '[]', '[]', 'none', '[]', '[]', 'web', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
            ('row-2', 'client-two', 'Spaced Orchard', '[]', '[]', '[]', 'none', '[]', '[]', 'web', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
            ('row-3', 'client-three', 'Other', '[]', '[]', '[]', 'none', '[]', '[]', 'web', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );

  const found = await ctx.auth.clients.readByName(' Spaced Orchard ');

  expect(found.map((client) => client.clientID).toSorted()).toStrictEqual([
    toTagged<OAuthClientID>('client-one'),
    toTagged<OAuthClientID>('client-two'),
  ]);
});

test('#clients.readByName returns an empty list for a name no client has', async () => {
  const ctx = await setupTest();
  const found = await ctx.auth.clients.readByName('Nobody');

  expect(found).toStrictEqual([]);
});
