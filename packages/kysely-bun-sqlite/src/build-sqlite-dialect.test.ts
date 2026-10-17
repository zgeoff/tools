import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Kysely } from 'kysely';
import { buildSQLiteDialect } from './build-sqlite-dialect.ts';

interface GardenSchema {
  plants: { species: string };
}

function setupTest() {
  const sqlite = new Database(':memory:');
  const db = new Kysely<GardenSchema>({ dialect: buildSQLiteDialect(sqlite) });

  onTestFinished(async () => {
    await db.destroy();

    sqlite.close();
  });

  return { sqlite, db };
}

test('it runs a query through Kysely', async () => {
  const ctx = setupTest();

  ctx.sqlite.run('CREATE TABLE plants (species TEXT NOT NULL)');
  ctx.sqlite.run("INSERT INTO plants (species) VALUES ('fern')");

  const rows = await ctx.db.selectFrom('plants').select('species').execute();

  expect(rows).toStrictEqual([{ species: 'fern' }]);
});

test('it runs concurrent Kysely transactions one at a time', async () => {
  const ctx = setupTest();

  ctx.sqlite.run('CREATE TABLE plants (species TEXT NOT NULL)');

  const gate = Promise.withResolvers<void>();

  const first = ctx.db.transaction().execute(async (trx) => {
    await trx.insertInto('plants').values({ species: 'fern' }).execute();

    await gate.promise;

    await trx.insertInto('plants').values({ species: 'moss' }).execute();
  });

  const second = ctx.db.transaction().execute(async (trx) => {
    await trx.insertInto('plants').values({ species: 'ivy' }).execute();
  });

  // An immediate fires only after every queued promise callback has run, so
  // the second transaction has had every chance to start inside the first.
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  gate.resolve();

  await Promise.all([first, second]);

  expect(ctx.sqlite.query('SELECT species FROM plants ORDER BY rowid').all()).toStrictEqual([
    { species: 'fern' },
    { species: 'moss' },
    { species: 'ivy' },
  ]);
});
