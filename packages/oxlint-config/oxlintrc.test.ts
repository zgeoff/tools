import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOxlint } from './test-utils/run-oxlint.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'oxlintrc-test-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test.each([
  ['hook.ts', true],
  ['view.tsx', true],
  ['hook.test.ts', false],
  ['view.test.tsx', false],
  ['hook.claude-check.ts', false],
])('it reports max-lines for a 501-line %s: %p', async (fileName, expected) => {
  const lines = Array.from({ length: 501 }, (_, index) => `export const value${index} = 0;`);

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, fileName), `${lines.join('\n')}\n`);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), fileName],
    ctx.directory,
  );

  expect(run.stdout.includes('eslint(max-lines)')).toBe(expected);
});

test('it reports a module-level helper in a test file', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\nconst cups = 2;\n\ntest('it pours', () => {\n  expect(cups).toBe(2);\n});\n";

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'pot.test.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'pot.test.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('zgeoff(setup-test-only)');
});

test.each(['kettle.ts', 'kettle.test.ts'])('it reports a class in %s', async (fileName) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, fileName), 'export class Kettle {}\n');

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), fileName],
    ctx.directory,
  );

  expect(run.stdout).toInclude('zgeoff(no-class)');
});

test('it reports a switch and names ts-pattern', async () => {
  const source =
    "export function readTone(tone: 'warm' | 'cool'): number {\n  switch (tone) {\n    case 'warm': {\n      return 1;\n    }\n    default: {\n      return 2;\n    }\n  }\n}\n";

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'tone.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'tone.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('zgeoff(no-switch)');
  expect(run.stdout).toInclude('ts-pattern');
});

test('it reports a declaration that lists two variables, but not their order', async () => {
  const source = 'export const width = 3, height = 4;\n';

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'size.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'size.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('eslint(one-var)');
  expect(run.stdout).not.toInclude('eslint(sort-vars)');
});

test('it accepts one declaration per variable', async () => {
  const source = 'export const width = 3;\nexport const height = 4;\n';

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'size.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'size.ts'],
    ctx.directory,
  );

  expect(run.stdout).not.toInclude('eslint(one-var)');
});

test('it reports a file snapshot matcher', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').toMatchSnapshot();\n});\n";

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'banner.test.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'banner.test.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('zgeoff(no-file-snapshot)');
  expect(run.stdout).toInclude('toMatchSnapshot');
});

test('it reports a test file with a snapshot file in __snapshots__/', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').toBe('ready');\n});\n";

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'banner.test.ts'), source);
  await mkdir(join(ctx.directory, '__snapshots__'));

  await writeFile(
    join(ctx.directory, '__snapshots__', 'banner.test.ts.snap'),
    '// Bun Snapshot v1\n',
  );

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'banner.test.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('zgeoff(no-file-snapshot)');
  expect(run.stdout).toInclude('__snapshots__/banner.test.ts.snap');
});

test.each([
  ['a variable `s`', 'export const s = 1;\n', 'eslint(id-length)'],
  [
    'a parameter `r`',
    'export function readWidth(r: number): number {\n  return r;\n}\n',
    'eslint(id-length)',
  ],
  ['a variable `e`', 'export const e = 1;\n', 'eslint(id-length)'],
  [
    'a catch parameter `e`',
    'export function readLabel(): string {\n  try {\n    return String(globalThis);\n  } catch (e) {\n    return String(e);\n  }\n}\n',
    'eslint(id-length)',
  ],
  ['a variable `mgr`', 'export const mgr = 1;\n', 'zgeoff(no-abbreviated-names)'],
  ['a variable `ms`', 'export const ms = 1;\n', 'zgeoff(no-abbreviated-names)'],
])('it reports %s', async (_label, source, rule) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'names.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'names.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude(rule);
});

test('it names `manager` when it reports `mgr`', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'names.ts'), 'export const mgr = 1;\n');

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'names.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('Rename `mgr` to `manager`');
});

test.each(['x', 'y', 'z', '$', '_', 'ctx', 'id', 'db', 'timeoutMs'])(
  'it accepts a variable `%s`',
  async (name) => {
    const ctx = await setupTest();

    await writeFile(join(ctx.directory, 'names.ts'), `export const ${name} = 1;\n`);

    const run = await runOxlint(
      ['-c', join(import.meta.dir, 'oxlintrc.json'), 'names.ts'],
      ctx.directory,
    );

    expect(run.stdout).not.toInclude('eslint(id-length)');
    expect(run.stdout).not.toInclude('zgeoff(no-abbreviated-names)');
  },
);

test('it accepts a one-letter type parameter', async () => {
  const source = 'export function buildValue<T>(value: T): T {\n  return value;\n}\n';

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'names.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'names.ts'],
    ctx.directory,
  );

  expect(run.stdout).not.toInclude('eslint(id-length)');
});

test.each([
  [
    'a destructured alias',
    'const input = { session: 1 };\nconst { session: s } = input;\n\nexport const value = s;\n',
  ],
  [
    'a destructured shorthand',
    'const input = Object.fromEntries([["s", 1]]);\nconst { s } = input;\n\nexport const value = s;\n',
  ],
  ['an array element', 'const [s] = [1];\n\nexport const value = s;\n'],
  ['an object key', 'export const value = { s: 1 };\n'],
])('it reports a one-letter name in %s', async (_label, source) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'names.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'names.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('eslint(id-length)');
});

test.each([
  [
    'a destructured kept name',
    'const point = { x: 1 };\nconst { x } = point;\n\nexport const value = x;\n',
  ],
  ['an unread array placeholder', 'const [first, _] = [1, 2];\n\nexport const value = first;\n'],
  [
    'a one-letter key that an alias renames',
    'const input = Object.fromEntries([["s", 1]]);\nconst { s: session } = input;\n\nexport const value = session;\n',
  ],
])('it accepts %s', async (_label, source) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'names.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'names.ts'],
    ctx.directory,
  );

  expect(run.stdout).not.toInclude('eslint(id-length)');
});

// the abbreviations sit in rows rather than object keys, so this file passes
// the rule
test('it denies exactly the listed abbreviations', async () => {
  const text = await Bun.file(join(import.meta.dir, 'oxlintrc.json')).text();

  const config: unknown = Bun.JSONC.parse(text);

  expect(config).toHaveProperty(
    ['rules', 'zgeoff/no-abbreviated-names', 1, 'names'],
    Object.fromEntries([
      ['mgr', '`manager`'],
      ['dir', '`directory`'],
      ['tmp', '`temporary`'],
      ['proc', '`process`'],
      ['src', '`source`'],
      ['dest', '`destination`'],
      ['prev', '`previous`'],
      ['msg', '`message`'],
      ['ms', 'a name for the value with `Ms` as its unit suffix, such as `timeoutMs`'],
    ] as const),
  );
});

test.each([
  ['mgr', '`manager`'],
  ['dir', '`directory`'],
  ['tmp', '`temporary`'],
  ['proc', '`process`'],
  ['src', '`source`'],
  ['dest', '`destination`'],
  ['prev', '`previous`'],
  ['msg', '`message`'],
  ['ms', 'a name for the value with `Ms` as its unit suffix, such as `timeoutMs`'],
] as const)('it reports `%s` as %s', async (name, replacement) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'names.ts'), `export const ${name} = 1;\n`);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'names.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude(`Rename \`${name}\` to ${replacement}:`);
});

test.each([
  ['an as assertion', 'export const size = JSON.parse("1") as number;\n'],
  ['an angle-bracket assertion', 'export const size = <number>JSON.parse("1");\n'],
  ['a double assertion', 'export const size = "1" as unknown as number;\n'],
])('it reports %s', async (_label, source) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'size.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'size.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('typescript(consistent-type-assertions)');
});

test.each([
  ['an as const assertion', "export const sizes = ['small', 'large'] as const;\n"],
  ['a satisfies check', "export const sizes = ['small', 'large'] satisfies string[];\n"],
])('it accepts %s', async (_label, source) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'size.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'size.ts'],
    ctx.directory,
  );

  expect(run.stdout).not.toInclude('consistent-type-assertions');
});

test('it reports a type argument on a sql tag', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'rows.ts'), 'export const rows = sql<number>`select 1`;\n');

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'rows.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('zgeoff(no-hidden-cast)');
});

test('it reports the require global under the node env', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'brew.ts'), "export const kettle = require('./kettle');\n");

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'brew.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('zgeoff(no-require)');
});

test('it reports a CommonJS export', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'brew.ts'), 'module.exports = { cups: 2 };\n');

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'brew.ts'],
    ctx.directory,
  );

  expect(run.stdout).toInclude('import(no-commonjs)');
});

test.each([
  ["import * as z from 'zod';\n\nexport const name = z.string();\n", false],
  ["import * as mini from 'zod/mini';\n\nexport const name = mini.string();\n", false],
  ["import * as path from 'node:path';\n\nexport const separator = path.sep;\n", true],
])('it reports the namespace import in %p: %p', async (source, expected) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'schema.ts'), source);

  const run = await runOxlint(
    ['-c', join(import.meta.dir, 'oxlintrc.json'), 'schema.ts'],
    ctx.directory,
  );

  expect(run.stdout.includes('import(no-namespace)')).toBe(expected);
});
