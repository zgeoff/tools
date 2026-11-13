import { expect, onTestFinished, test } from 'bun:test';
import { toTagged } from '@zgeoff/std';
import type { GrantID } from '../types.ts';
import { createTestDatabase } from './create-test-database.ts';
import { openTestAuth } from './open-test-auth.ts';

test('it opens a server at the test origin with the read and write scopes', async () => {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  expect(server.auth.resource).toBe('https://app.example/mcp');
});

test('it collects the grants the core revoked', async () => {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  await server.auth.grants.revoke(toTagged<GrantID>('unknown-grant'));

  expect(server.revoked).toStrictEqual([]);
});

test('it opens the database the test gives it', async () => {
  const database = createTestDatabase();

  const server = await openTestAuth({ database });

  onTestFinished(() => server.close());

  expect(server.database).toBe(database);
});
