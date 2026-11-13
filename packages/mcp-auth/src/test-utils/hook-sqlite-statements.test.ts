import { expect, onTestFinished, test } from 'bun:test';
import { createTestDatabase } from './create-test-database.ts';
import { hookSQLiteStatements } from './hook-sqlite-statements.ts';

function setupTest() {
  const database = createTestDatabase();

  onTestFinished(() => {
    database.close();
  });

  const statements: string[] = [];

  hookSQLiteStatements(database, (statement) => statements.push(statement));

  return { database, statements };
}

test('it reports each statement before it runs', () => {
  const ctx = setupTest();

  ctx.database.query('select 1 as one').get();
  ctx.database.query('select 2 as two').get();

  expect(ctx.statements).toStrictEqual(['select 1 as one', 'select 2 as two']);
});

test('it lets the statement run and return its rows', () => {
  const ctx = setupTest();
  const row = ctx.database.query('select 7 as seven').get();

  expect(row).toStrictEqual({ seven: 7 });
});

test('it reports a statement before the hook can see its effect', () => {
  const ctx = setupTest();

  ctx.database.run('create table notes (title text)');

  const counts: number[] = [];

  hookSQLiteStatements(ctx.database, (statement) => {
    if (statement.startsWith('select count')) {
      counts.push(1);
    }
  });

  ctx.database.query('select count(*) as total from notes').get();

  expect(counts).toStrictEqual([1]);
});
