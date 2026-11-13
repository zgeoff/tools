import { expect, onTestFinished, test } from 'bun:test';
import { openTestAuth } from './open-test-auth.ts';
import { seedClient } from './seed-client.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return server;
}

test('it adds a client with a generated name and a redirect URI', async () => {
  const ctx = await setupTest();
  const client = await seedClient(ctx.auth);
  const listed = await ctx.auth.clients.list();

  expect(client.name).toMatch(/^client-[0-9a-f]{8}$/u);
  expect(client.redirectURIs).toStrictEqual(['https://client.example/callback']);
  expect(listed).toStrictEqual([client]);
});

test('it takes the name and the redirect URIs from its input', async () => {
  const ctx = await setupTest();

  const client = await seedClient(ctx.auth, {
    name: 'Claude',
    redirectURIs: ['https://assistant.example/callback'],
  });

  expect(client).toMatchObject({
    name: 'Claude',
    redirectURIs: ['https://assistant.example/callback'],
  });
});
