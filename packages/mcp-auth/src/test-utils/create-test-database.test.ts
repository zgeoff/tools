import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from './create-test-database.ts';

test('it opens an empty in-memory database', () => {
  const database = createTestDatabase();

  onTestFinished(() => {
    database.close();
  });

  database.run('create table notes (title text)');
  database.run("insert into notes values ('a')");

  expect(database.query('select title from notes').all()).toStrictEqual([{ title: 'a' }]);
});

test('it opens a database at the path it is given, which a second connection sees', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mcp-auth-db-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const path = join(directory, 'test.sqlite');
  const first = createTestDatabase(path);
  const second = createTestDatabase(path);

  onTestFinished(() => {
    first.close();
    second.close();
  });

  first.run('create table notes (title text)');
  first.run("insert into notes values ('a')");

  expect(second.query('select title from notes').all()).toStrictEqual([{ title: 'a' }]);
});
