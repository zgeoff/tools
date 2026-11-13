import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { DEFAULT_PATHS } from '../default-paths.ts';
import { buildStubClock } from '../test-utils/build-stub-clock.ts';
import { createTestDatabase } from '../test-utils/create-test-database.ts';
import type { MCPAuthTables } from '../types.ts';
import { openStore } from './open-store.ts';

function setupTest() {
  const database = createTestDatabase();

  onTestFinished(() => {
    database.close();
  });

  const open = (tables: MCPAuthTables) =>
    openStore(
      {
        database,
        scopes: ['read'],
        tables,
        clock: buildStubClock(),
        onGrantRevoked: () => {},
      },
      { origin: 'https://app.example', paths: DEFAULT_PATHS },
    );

  return { database, open };
}

test('#openStore migrates a fresh database and keeps the cascading keys a revoke relies on', async () => {
  const ctx = setupTest();

  const store = await ctx.open({ passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' });

  onTestFinished(() => store.db.destroy());

  const keys = ctx.database.query('PRAGMA foreign_key_list("oauthRefreshToken")').all();

  expect(keys).toContainEqual(
    expect.objectContaining({ table: 'user', from: 'userId', on_delete: 'CASCADE' }),
  );
});

test('#openStore creates the passkey and enrollment tables under the names it is given', async () => {
  const ctx = setupTest();

  const store = await ctx.open({ passkey: 'my_keys', enrollmentToken: 'my_enrollments' });

  onTestFinished(() => store.db.destroy());

  const names = ctx.database
    .query("select name from sqlite_master where type = 'table' and name like 'my_%' order by name")
    .all();

  expect(names).toStrictEqual([{ name: 'my_enrollments' }, { name: 'my_keys' }]);
});

test('#openStore opens a database it already migrated', async () => {
  const ctx = setupTest();

  const first = await ctx.open({ passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' });

  await first.db.destroy();

  const second = await ctx.open({
    passkey: 'app_passkey',
    enrollmentToken: 'app_enrollment_token',
  });

  onTestFinished(() => second.db.destroy());

  expect(second.db).toBeDefined();
});

test('#openStore refuses a connection with foreign keys off, which a transaction leaves', () => {
  const ctx = setupTest();

  ctx.database.run('begin');

  const opened = ctx.open({ passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' });

  expect(opened).rejects.toMatchObject({ code: 'invalid-setup' });
});

test.each([['bad name'], ['a;drop table user'], ['1abc'], ['']])(
  '#openStore refuses the table name %p',
  (name) => {
    const ctx = setupTest();
    const opened = ctx.open({ passkey: name, enrollmentToken: 'app_enrollment_token' });

    expect(opened).rejects.toMatchObject({ code: 'invalid-setup' });
  },
);

test('#openStore refuses a user table that lacks the grant columns', () => {
  const ctx = setupTest();

  ctx.database.run('create table "user" (id text primary key, name text, email text)');

  const opened = ctx.open({ passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' });

  expect(opened).rejects.toMatchObject({ code: 'invalid-setup' });
});

test('#openStore refuses token tables whose user key does not cascade', () => {
  const ctx = setupTest();

  ctx.database.run(
    'create table "user" (id text primary key, name text, email text, clientId text, approvedBy text)',
  );

  ctx.database.run(
    'create table "session" (id text primary key, userId text references "user"(id))',
  );

  const opened = ctx.open({ passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' });

  expect(opened).rejects.toMatchObject({ code: 'invalid-setup' });
});

test('#openStore refuses a passkey table that lacks a column and leaves it unchanged', () => {
  const ctx = setupTest();

  ctx.database.run('create table app_passkey (id text primary key not null)');

  const opened = ctx.open({ passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' });

  expect(opened).rejects.toMatchObject({ code: 'invalid-setup' });
  expect(ctx.database.query('PRAGMA table_info(app_passkey)').all()).toHaveLength(1);
});

test('#openStore adds a missing column to an enrollment table of the core', async () => {
  const ctx = setupTest();

  ctx.database.run('create table app_enrollment_token (token_hash text primary key not null)');

  const store = await ctx.open({ passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' });

  onTestFinished(() => store.db.destroy());

  const columns = ctx.database.query('PRAGMA table_info(app_enrollment_token)').all();

  expect(columns.map((column) => z.object({ name: z.string() }).parse(column).name)).toStrictEqual([
    'token_hash',
    'created_at',
    'expires_at',
  ]);
});

test.each([['oauthAccessToken'], ['oauthRefreshToken'], ['session']])(
  '#openStore refuses a %s table whose cascading key references user(email)',
  (table) => {
    const ctx = setupTest();

    ctx.database.run(
      'create table "user" (id text primary key, name text, email text unique, clientId text, approvedBy text)',
    );

    ctx.database.run(
      `create table "${table}" (id text primary key, userId text references "user"(email) on delete cascade)`,
    );

    const opened = ctx.open({ passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' });

    expect(opened).rejects.toMatchObject({ code: 'invalid-setup' });
  },
);

test('#openStore keeps no service token file from the options it was given', async () => {
  const ctx = setupTest();

  // A caller passes the full options of openMCPAuth, which extend the admin ones.
  const options = {
    database: ctx.database,
    scopes: ['read'],
    tables: { passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' },
    clock: buildStubClock(),
    onGrantRevoked: () => {},
    serviceTokens: {
      prefix: 'svc_',
      file: { resource: 'https://app.example/mcp', clients: [] },
    },
  };

  const store = await openStore(options, { origin: 'https://app.example', paths: DEFAULT_PATHS });

  onTestFinished(() => store.db.destroy());

  expect(Object.keys(store.options).toSorted()).toStrictEqual([
    'clock',
    'database',
    'onGrantRevoked',
    'scopes',
    'tables',
  ]);
});
