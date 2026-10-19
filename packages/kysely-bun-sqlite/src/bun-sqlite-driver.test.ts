import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { setImmediate } from 'node:timers/promises';
import { CompiledQuery } from 'kysely';
import { buildBunSQLiteDriver } from './bun-sqlite-driver.ts';

function setupTest() {
  const sqlite = new Database(':memory:');

  onTestFinished(() => {
    sqlite.close();
  });

  const driver = buildBunSQLiteDriver(sqlite);

  return { sqlite, driver };
}

test('it keeps the writes of a committed transaction', async () => {
  const ctx = setupTest();

  ctx.sqlite.run('CREATE TABLE plants (species TEXT NOT NULL)');

  const connection = await ctx.driver.acquireConnection();

  await ctx.driver.beginTransaction(connection, {});
  await connection.executeQuery(CompiledQuery.raw("INSERT INTO plants (species) VALUES ('fern')"));
  await ctx.driver.commitTransaction(connection);

  expect({
    inTransaction: ctx.sqlite.inTransaction,
    rows: ctx.sqlite.query('SELECT species FROM plants').all(),
  }).toStrictEqual({ inTransaction: false, rows: [{ species: 'fern' }] });
});

test('it drops the writes of a rolled-back transaction', async () => {
  const ctx = setupTest();

  ctx.sqlite.run('CREATE TABLE plants (species TEXT NOT NULL)');

  const connection = await ctx.driver.acquireConnection();

  await ctx.driver.beginTransaction(connection, {});
  await connection.executeQuery(CompiledQuery.raw("INSERT INTO plants (species) VALUES ('moss')"));
  await ctx.driver.rollbackTransaction(connection);

  expect(ctx.sqlite.query('SELECT species FROM plants').all()).toStrictEqual([]);
});

test('it answers a statement that returns columns with its rows', async () => {
  const ctx = setupTest();

  const connection = await ctx.driver.acquireConnection();
  const result = await connection.executeQuery(CompiledQuery.raw('SELECT ? AS height', [42]));

  expect(result).toStrictEqual({ rows: [{ height: 42 }] });
});

test('it answers a write with the rows it changed and the last inserted row id', async () => {
  const ctx = setupTest();

  ctx.sqlite.run('CREATE TABLE plants (species TEXT NOT NULL)');
  ctx.sqlite.run("INSERT INTO plants (species) VALUES ('ivy')");

  const connection = await ctx.driver.acquireConnection();

  const result = await connection.executeQuery(
    CompiledQuery.raw('INSERT INTO plants (species) VALUES (?)', ['sorrel']),
  );

  expect(result).toStrictEqual({ rows: [], numAffectedRows: 1n, insertId: 2n });
});

test('it refuses a streaming query', async () => {
  const ctx = setupTest();

  const connection = await ctx.driver.acquireConnection();

  expect(() => connection.streamQuery(CompiledQuery.raw('SELECT 1'), 1)).toThrowWithMessage(
    Error,
    'The bun:sqlite driver does not support streaming queries',
  );
});

test('it waits for the caller that holds the connection before it finishes destroying', async () => {
  const ctx = setupTest();

  const connection = await ctx.driver.acquireConnection();

  const destroyed = ctx.driver.destroy();

  // An immediate fires only after every queued promise callback has run, so
  // a destroy still pending here waits on the holder and nothing else.
  await setImmediate();

  const statusWhileHeld = Bun.peek.status(destroyed);

  await ctx.driver.releaseConnection(connection);

  await destroyed;

  expect(statusWhileHeld).toBe('pending');
});

test('it leaves the handle open when the driver is destroyed', async () => {
  const ctx = setupTest();

  await ctx.driver.destroy();

  expect(ctx.sqlite.query('SELECT 1 AS value').get()).toStrictEqual({ value: 1 });
});
