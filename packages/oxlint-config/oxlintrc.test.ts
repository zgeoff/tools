import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const oxlintBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint');
const configPath = join(import.meta.dir, 'oxlintrc.json');

function createLongSource(lineCount: number): string {
  const lines = Array.from({ length: lineCount }, (_, index) => `export const value${index} = 0;`);

  return `${lines.join('\n')}\n`;
}

async function setupTest(fileName: string, source: string) {
  const dir = await mkdtemp(join(tmpdir(), 'oxlintrc-test-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, fileName), source);

  return { dir };
}

async function runLint(dir: string, fileName: string): Promise<string> {
  const proc = Bun.spawn([oxlintBin, '-c', configPath, fileName], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);

  return stdout;
}

test.each([
  ['hook.ts', true],
  ['view.tsx', true],
  ['hook.test.ts', false],
  ['view.test.tsx', false],
  ['hook.claude-check.ts', false],
])('it reports max-lines for a 501-line %s: %p', async (fileName, expected) => {
  const ctx = await setupTest(fileName, createLongSource(501));
  const stdout = await runLint(ctx.dir, fileName);

  expect(stdout.includes('eslint(max-lines)')).toBe(expected);
});

test('it reports a switch and names ts-pattern', async () => {
  const source =
    "export function readTone(tone: 'warm' | 'cool'): number {\n  switch (tone) {\n    case 'warm': {\n      return 1;\n    }\n    default: {\n      return 2;\n    }\n  }\n}\n";

  const ctx = await setupTest('tone.ts', source);
  const stdout = await runLint(ctx.dir, 'tone.ts');

  expect(stdout).toInclude('zgeoff(no-switch)');
  expect(stdout).toInclude('ts-pattern');
});

test('it reports a declaration that lists two variables, but not their order', async () => {
  const source = 'export const width = 3, height = 4;\n';

  const ctx = await setupTest('size.ts', source);
  const stdout = await runLint(ctx.dir, 'size.ts');

  expect(stdout).toInclude('eslint(one-var)');
  expect(stdout).not.toInclude('eslint(sort-vars)');
});

test('it accepts one declaration per variable', async () => {
  const source = 'export const width = 3;\nexport const height = 4;\n';

  const ctx = await setupTest('size.ts', source);
  const stdout = await runLint(ctx.dir, 'size.ts');

  expect(stdout).not.toInclude('eslint(one-var)');
});

test('it reports a file snapshot matcher', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').toMatchSnapshot();\n});\n";

  const ctx = await setupTest('banner.test.ts', source);
  const stdout = await runLint(ctx.dir, 'banner.test.ts');

  expect(stdout).toInclude('zgeoff(no-file-snapshot)');
  expect(stdout).toInclude('toMatchSnapshot');
});

test('it reports a test file with a snapshot file in __snapshots__/', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').toBe('ready');\n});\n";

  const ctx = await setupTest('banner.test.ts', source);

  await mkdir(join(ctx.dir, '__snapshots__'));
  await writeFile(join(ctx.dir, '__snapshots__', 'banner.test.ts.snap'), '// Bun Snapshot v1\n');

  const stdout = await runLint(ctx.dir, 'banner.test.ts');

  expect(stdout).toInclude('zgeoff(no-file-snapshot)');
  expect(stdout).toInclude('__snapshots__/banner.test.ts.snap');
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
  const ctx = await setupTest('names.ts', source);
  const stdout = await runLint(ctx.dir, 'names.ts');

  expect(stdout).toInclude(rule);
});

test('it names `manager` when it reports `mgr`', async () => {
  const ctx = await setupTest('names.ts', 'export const mgr = 1;\n');
  const stdout = await runLint(ctx.dir, 'names.ts');

  expect(stdout).toInclude('Rename `mgr` to `manager`');
});

test.each(['x', 'y', 'z', '$', '_', 'ctx', 'id', 'db', 'timeoutMs'])(
  'it accepts a variable `%s`',
  async (name) => {
    const ctx = await setupTest('names.ts', `export const ${name} = 1;\n`);
    const stdout = await runLint(ctx.dir, 'names.ts');

    expect(stdout).not.toInclude('eslint(id-length)');
    expect(stdout).not.toInclude('zgeoff(no-abbreviated-names)');
  },
);

test('it accepts a one-letter type parameter', async () => {
  const source = 'export function buildValue<T>(value: T): T {\n  return value;\n}\n';

  const ctx = await setupTest('names.ts', source);
  const stdout = await runLint(ctx.dir, 'names.ts');

  expect(stdout).not.toInclude('eslint(id-length)');
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
  const ctx = await setupTest('names.ts', source);
  const stdout = await runLint(ctx.dir, 'names.ts');

  expect(stdout).toInclude('eslint(id-length)');
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
  const ctx = await setupTest('names.ts', source);
  const stdout = await runLint(ctx.dir, 'names.ts');

  expect(stdout).not.toInclude('eslint(id-length)');
});

// each abbreviation the shipped config denies, with the text its report gives
// in place of the name; an entry added to or removed from the config without
// this list fails
const abbreviations = {
  mgr: '`manager`',
  dir: '`directory`',
  tmp: '`temporary`',
  proc: '`process`',
  src: '`source`',
  dest: '`destination`',
  prev: '`previous`',
  msg: '`message`',
  ms: 'a name for the value with `Ms` as its unit suffix, such as `timeoutMs`',
};

test('it denies exactly the listed abbreviations', async () => {
  const text = await Bun.file(configPath).text();

  const config: unknown = Bun.JSONC.parse(text);

  expect(config).toHaveProperty(
    ['rules', 'zgeoff/no-abbreviated-names', 1, 'names'],
    abbreviations,
  );
});

test.each(Object.entries(abbreviations))('it reports `%s` as %s', async (name, replacement) => {
  const ctx = await setupTest('names.ts', `export const ${name} = 1;\n`);
  const stdout = await runLint(ctx.dir, 'names.ts');

  expect(stdout).toInclude(`Rename \`${name}\` to ${replacement}:`);
});
