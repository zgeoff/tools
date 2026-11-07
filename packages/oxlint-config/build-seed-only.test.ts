import { expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLintTree } from './src/test-utils/create-lint-tree.ts';
import { runLintIn } from './src/test-utils/run-lint-in.ts';
import { runLintTree } from './src/test-utils/run-lint-tree.ts';

// oxlint-disable zgeoff/seed-only, no-template-curly-in-string -- the SQL and the interpolations are fixtures of the rule under test, whose product is reports on SQL

test.each([
  ['insertInto', "await db.insertInto('kettles').values({ id: 1 }).execute();"],
  ['updateTable', "await db.updateTable('kettles').set({ full: true }).execute();"],
  ['deleteFrom', "await db.deleteFrom('kettles').execute();"],
  ['a raw INSERT', "db.run('INSERT INTO kettles (id) VALUES (1)');"],
  ['a raw INSERT OR REPLACE', "db.run('INSERT OR REPLACE INTO kettles (id) VALUES (1)');"],
  ['a raw UPDATE', 'db.run(`UPDATE kettles SET full = 1`);'],
  ['a raw DELETE', 'await db.execute(sql`DELETE FROM kettles WHERE id = ${1}`);'],
  ['a lower-case raw INSERT', "db.run('insert into kettles (id) values (1)');"],
  ['a lower-case raw DELETE in a sql tag', 'await sql`delete from kettles`.execute(db);'],
  ['a raw REPLACE', "db.run('REPLACE INTO kettles (id) VALUES (1)');"],
  ['a raw UPDATE of an aliased table', "db.run('UPDATE kettles AS k SET full = 1');"],
])('it reports %s in a test file', async (_, write) => {
  const source = `test('it pours a kettle', async () => {\n  ${write}\n});\n`;

  const result = await runLintTree({ 'src/pour.test.ts': source }, 'src/pour.test.ts', {
    'zgeoff/seed-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(seed-only)');
  expect(result.stdout).toInclude("Seed 'kettles' through the module that writes it");
});

test.each([
  [
    'a lower-case insert in a title',
    "test('it can insert into kettles and update them', () => {});\n",
  ],
  [
    'an upper-case delete in a test.each title',
    "test.each([1])('DELETE FROM a list drops row %d', () => {});\n",
  ],
  ['a select', "test('it reads', () => {\n  db.run('SELECT * FROM kettles');\n});\n"],
  [
    'an upsert clause',
    "test('it reads', () => {\n  db.run('SELECT 1 ON CONFLICT DO UPDATE SET full = 1');\n});\n",
  ],
])('it accepts %s in a test file', async (_, source) => {
  const result = await runLintTree({ 'src/pour.test.ts': source }, 'src/pour.test.ts', {
    'zgeoff/seed-only': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each([
  [
    'a helper',
    'src/test-utils/write-kettle.ts',
    "export async function writeKettle(db: Db) {\n  await db.insertInto('kettles').values({ id: 1 }).execute();\n}\n",
  ],
  [
    'a seed-named function inside a helper',
    'src/test-utils/write-kettle.ts',
    "export async function writeKettle(db: Db) {\n  const seedIt = () => db.insertInto('kettles').values({ id: 1 }).execute();\n\n  await seedIt();\n}\n",
  ],
  [
    'a test that is not a seed test, beside a seed that writes the table',
    'src/test-utils/build-app.test.ts',
    "test('it builds an app', async () => {\n  await db.insertInto('kettles').values({ id: 1 }).execute();\n});\n",
  ],
])('it reports a write in test-utils inside %s', async (_, path, source) => {
  const seed =
    "export const seedCrackedKettle = (db: Db) => db.insertInto('kettles').values({ cracked: true });\n";

  const result = await runLintTree(
    { 'src/test-utils/seed-cracked-kettle.ts': seed, [path]: source },
    path,
    { 'zgeoff/seed-only': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("Seed 'kettles' through the module that writes it");
});

test.each([
  [
    'a seed function declaration',
    "export async function seedCrackedKettle(db: Db) {\n  // a kettle from before cracks were refused\n  await db.insertInto('kettles').values({ cracked: true }).execute();\n}\n",
  ],
  [
    'a callback of a seed arrow function',
    'export const seedCrackedKettles = async (db: Db) => {\n  await Promise.all([1, 2].map((id) => db.run(`INSERT INTO kettles (id) VALUES (${id})`)));\n};\n',
  ],
])('it accepts a write inside %s in test-utils', async (_, source) => {
  const result = await runLintTree(
    { 'src/test-utils/seed-cracked-kettle.ts': source },
    'src/test-utils/seed-cracked-kettle.ts',
    { 'zgeoff/seed-only': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it reports a write inside a seed function outside test-utils', async () => {
  const source =
    "async function seedCrackedKettle(db: Db) {\n  await db.insertInto('kettles').values({ cracked: true }).execute();\n}\n\ntest('it pours', async () => {\n  await seedCrackedKettle(db);\n});\n";

  const result = await runLintTree({ 'src/pour.test.ts': source }, 'src/pour.test.ts', {
    'zgeoff/seed-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("Seed 'kettles' through the module that writes it");
});

test.each([
  [
    'a Kysely write',
    "export const fill = (db: Db) => db.insertInto('kettles').values({ id: 1 });\n",
  ],
  ['a raw write', "export const fill = (db: Db) => db.run('UPDATE kettles SET full = 1');\n"],
  [
    'a lower-case raw write',
    "export const fill = (db: Db) => db.run('insert into kettles (id) values (1)');\n",
  ],
  [
    'a schema-qualified raw write',
    'export const fill = (db: Db) => db.run(\'DELETE FROM "main"."kettles"\');\n',
  ],
  [
    'an aliased Kysely write',
    "export const fill = (db: Db) => db.updateTable('kettles as k').set({ full: true });\n",
  ],
])("it accepts a write in the owner's own test, found by %s", async (_, owner) => {
  const source =
    "test('it fills a kettle', async () => {\n  await db.insertInto('kettles').values({ id: 1 }).execute();\n});\n";

  const result = await runLintTree(
    { 'src/kettles/fill.ts': owner, 'src/kettles/fill.test.ts': source },
    'src/kettles/fill.test.ts',
    { 'zgeoff/seed-only': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test.each([
  [
    'a module that writes another table',
    'src/kettles/fill.ts',
    "export const fill = (db: Db) => db.insertInto('cups').values({ id: 1 });\n",
  ],
  [
    'only another test',
    'src/kettles/boil.test.ts',
    "test('it boils', () => db.insertInto('kettles').values({ id: 1 }));\n",
  ],
  [
    'only a declaration file',
    'src/kettles/fill.d.ts',
    "// db.insertInto('kettles')\nexport declare const fill: () => void;\n",
  ],
  [
    'a module in a parent folder',
    'src/fill.ts',
    "export const fill = (db: Db) => db.insertInto('kettles').values({ id: 1 });\n",
  ],
  [
    'a module that writes through a non-literal name',
    'src/kettles/fill.ts',
    'export const fill = (db: Db, table: string) => db.run(`INSERT INTO ${table} (id) VALUES (1)`);\n',
  ],
])('it reports a write in a test whose folder holds %s', async (_, path, owner) => {
  const source =
    "test('it fills a kettle', async () => {\n  await db.insertInto('kettles').values({ id: 1 }).execute();\n});\n";

  const result = await runLintTree(
    { [path]: owner, 'src/kettles/fill.test.ts': source },
    'src/kettles/fill.test.ts',
    { 'zgeoff/seed-only': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("Seed 'kettles' through the module that writes it");
});

test.each([
  ['a migration test', 'src/db/migrations/0003-add-spout.test.ts'],
  ['a test of a migrate module', 'src/db/migrate.test.ts'],
  ['a test of a run-migrations module', 'src/db/run-migrations.test.ts'],
  ["a seed's own test", 'src/test-utils/seed-cracked-kettle.test.ts'],
])('it accepts a write in %s', async (_, path) => {
  const source =
    "test('it keeps the kettles', async () => {\n  await db.insertInto('kettles').values({ id: 1 }).execute();\n  db.run(`DELETE FROM ${table}`);\n});\n";

  const result = await runLintTree({ [path]: source }, path, { 'zgeoff/seed-only': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it reports a write in a test whose path only holds migration inside a word', async () => {
  const source =
    "test('it grants a visa', async () => {\n  await db.insertInto('visas').values({ id: 1 }).execute();\n});\n";

  const result = await runLintTree(
    { 'src/immigration/visa.test.ts': source },
    'src/immigration/visa.test.ts',
    { 'zgeoff/seed-only': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("Seed 'visas' through the module that writes it");
});

test('it honours a file-level disable comment in a test of code whose product is SQL', async () => {
  const source =
    "// oxlint-disable zgeoff/seed-only -- tests the dialect, whose product is SQL\ntest('it compiles an insert', () => {\n  db.run('INSERT INTO kettles (id) VALUES (1)');\n});\n";

  const result = await runLintTree({ 'src/dialect.test.ts': source }, 'src/dialect.test.ts', {
    'zgeoff/seed-only': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each([
  ['a Kysely table in a variable', 'await db.insertInto(table).values({ id: 1 }).execute();'],
  ['a Kysely table in a template literal', 'await db.deleteFrom(`kettles`).execute();'],
  ['a raw table in an interpolation', 'db.run(`UPDATE ${table} SET full = 1`);'],
])('it reports %s as a non-literal table name', async (_, write) => {
  const source = `test('it pours a kettle', async () => {\n  ${write}\n});\n`;

  const result = await runLintTree(
    {
      'src/kettles/fill.ts': "export const fill = (db: Db) => db.insertInto('kettles');\n",
      'src/kettles/pour.test.ts': source,
    },
    'src/kettles/pour.test.ts',
    { 'zgeoff/seed-only': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Name the table in a string literal');
});

test.each([
  ['a module outside test-utils', 'src/fill.ts'],
  ['a module in an e2e folder', 'e2e/fill-kettles.ts'],
])('it leaves a write in %s alone', async (_, path) => {
  const source = "export const fill = (db: Db) => db.insertInto('kettles').values({ id: 1 });\n";

  const result = await runLintTree({ [path]: source }, path, { 'zgeoff/seed-only': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it reads a folder only for a write, and once for each folder', async () => {
  const ctx = await setupTest();

  const kettles = join(ctx.directory, 'src', 'kettles');
  const cups = join(ctx.directory, 'src', 'cups');

  await mkdir(kettles, { recursive: true });
  await mkdir(cups, { recursive: true });

  await writeFile(
    join(kettles, 'fill.ts'),
    "export const fill = (db: Db) => db.insertInto('kettles');\n",
  );

  await writeFile(
    join(kettles, 'fill.test.ts'),
    "test('it fills', () => db.insertInto('kettles').values({ id: 1 }));\n",
  );

  await writeFile(
    join(kettles, 'boil.test.ts'),
    "test('it boils', () => db.insertInto('kettles').values({ id: 2 }));\n",
  );

  await writeFile(join(cups, 'pour.ts'), 'export const pour = () => 1;\n');
  await writeFile(join(cups, 'pour.test.ts'), "test('it pours a cup', () => {});\n");

  const result = await runLintIn(ctx.directory, ctx.directory, 'src');
  const log = await readFile(ctx.logPath, 'utf8');

  expect(result.exitCode).toBe(0);
  expect(log).toBe(`${kettles}\n`);
});

// the rule takes its folder reader as an input, so a plugin that wraps the real reader logs each
// folder the rule reads
async function setupTest() {
  const directory = await createLintTree({}, {});

  const logPath = join(directory, '..', 'reads.log');
  const pluginPath = join(directory, '..', 'logging-plugin.js');

  const plugin = [
    "import { appendFileSync } from 'node:fs';",
    `import buildSeedOnly from ${JSON.stringify(join(import.meta.dir, 'build-seed-only.js'))};`,
    `import readFolderSources from ${JSON.stringify(join(import.meta.dir, 'read-folder-sources.js'))};`,
    '',
    'const readLoggedSources = (folder) => {',
    `  appendFileSync(${JSON.stringify(logPath)}, folder + '\\n');`,
    '  return readFolderSources(folder);',
    '};',
    '',
    "export default { meta: { name: 'zgeoff' }, rules: { 'seed-only': buildSeedOnly(readLoggedSources) } };",
    '',
  ].join('\n');

  await writeFile(logPath, '');
  await writeFile(pluginPath, plugin);

  await writeFile(
    join(directory, '.oxlintrc.json'),
    JSON.stringify({ jsPlugins: [pluginPath], rules: { 'zgeoff/seed-only': 'error' } }),
  );

  return { directory, logPath };
}
