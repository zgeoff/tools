import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'verb-contract-test-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const config = {
    jsPlugins: [join(import.meta.dir, 'plugin.js')],
    rules: { 'zgeoff/verb-contract': 'error' },
  };

  await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify(config));

  const oxlintBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint');

  const lint = async (source: string) => {
    await writeFile(join(directory, 'sample.ts'), source);

    const subprocess = Bun.spawn([oxlintBin, '-c', '.oxlintrc.json', 'sample.ts'], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [exitCode, stdout] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
    ]);

    return { exitCode, stdout };
  };

  return { lint };
}

test.each([
  ['is async', 'export async function buildThing(): Promise<number> {\n  return 1;\n}\n'],
  [
    'awaits',
    'export function buildThing(): void {\n  void (async () => {\n    await Promise.resolve();\n  })();\n}\n',
  ],
  [
    'calls `existsSync` from `node:fs`',
    "import { existsSync } from 'node:fs';\n\nexport function buildThing(): boolean {\n  return existsSync('a');\n}\n",
  ],
  [
    'calls `fs` from `node:fs/promises`',
    "import fs from 'node:fs/promises';\n\nexport function buildThing(): void {\n  void fs.rm('a');\n}\n",
  ],
  [
    'calls `execSync` from `node:child_process`',
    "import { execSync } from 'node:child_process';\n\nexport function buildThing(): void {\n  execSync('ls');\n}\n",
  ],
  ['calls `Bun.spawn`', "export function buildThing(): void {\n  Bun.spawn(['ls']);\n}\n"],
  ['calls `Bun.file`', "export function buildThing(): unknown {\n  return Bun.file('a');\n}\n"],
  ['calls `Bun.write`', "export function buildThing(): void {\n  void Bun.write('a', 'b');\n}\n"],
  [
    'calls `read` from `node:fs`',
    "import fs from 'node:fs';\n\nexport function buildThing(): string {\n  const read = fs.readFileSync;\n\n  return read('a', 'utf8');\n}\n",
  ],
  [
    'calls `Bun.spawn`',
    "export function buildThing(): void {\n  const { spawn: launch } = Bun;\n\n  launch(['ls']);\n}\n",
  ],
  [
    'runs a `$` shell command',
    "import { $ as shell } from 'bun';\n\nexport function buildThing(): unknown {\n  const run = shell;\n\n  return run`ls`;\n}\n",
  ],
  [
    'calls `spawn` from `bun`',
    "import { spawn } from 'bun';\n\nexport function buildThing(): void {\n  spawn(['ls']);\n}\n",
  ],
  [
    'runs a `$` shell command',
    "import { $ } from 'bun';\n\nexport function buildThing(): unknown {\n  return $`ls`;\n}\n",
  ],
  [
    'runs a `$` shell command',
    "import { $ as shell } from 'bun';\n\nexport function buildThing(): unknown {\n  return shell`ls`;\n}\n",
  ],
  [
    'calls `fetch`',
    "export function buildThing(): unknown {\n  return fetch('https://a.test');\n}\n",
  ],
  [
    'runs a database query',
    "export function buildThing(db: { selectFrom(table: string): { execute(): unknown } }): unknown {\n  return db.selectFrom('users').execute();\n}\n",
  ],
  [
    'reads the environment',
    "export function buildThing(): string {\n  return process.env['HOME'] ?? '';\n}\n",
  ],
  [
    "calls 'readConfig', whose verb may do I/O",
    "function readConfig(): string {\n  return '';\n}\n\nexport function buildThing(): string {\n  return readConfig();\n}\n",
  ],
  [
    "calls 'writeText', whose verb may do I/O",
    "export function buildThing(ctx: { writeText(text: string): void }): void {\n  ctx.writeText('a');\n}\n",
  ],
  [
    "calls 'loadReport', whose verb may do I/O",
    "import { loadReport } from './load-report.ts';\n\nexport function buildThing(): string {\n  return loadReport();\n}\n",
  ],
])('it reports a no-I/O verb on a function that %s', async (reason, source) => {
  const ctx = await setupTest();
  const result = await ctx.lint(source);

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    `'buildThing' starts with 'build', which promises no I/O, but it ${reason}`,
  );
});

test('it skips a callee imported from a third-party package', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    "import { readPackageUp } from 'read-package-up';\n\nexport function buildThing(): unknown {\n  return readPackageUp();\n}\n",
  );

  expect(result.exitCode).toBe(0);
});

test('it skips a bare built-in method on a parameter', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      'export function buildIndex(index: Map<string, number>, names: readonly string[]): number {',
      '  for (const name of names) {',
      '    index.set(name, name.length);',
      '  }',
      '',
      '  return index.size;',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test('it skips a bare built-in method name and a method on a value the function makes', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      'export function buildIndex(names: readonly string[]): Map<string, number> {',
      '  const index = new Map<string, number>();',
      '  const date = new Date(0);',
      '',
      '  date.setUTCDate(2);',
      '',
      '  for (const name of names) {',
      '    index.set(name, date.getUTCDate());',
      '  }',
      '',
      '  return index;',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test('it accepts I/O behind a verb that may do I/O or a free verb', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      "import { readFileSync } from 'node:fs';",
      '',
      'export async function readConfig(): Promise<string> {',
      "  return readFileSync('a', 'utf8');",
      '}',
      '',
      'export function resolveConfigPath(): string {',
      "  return process.env['CONFIG'] ?? readFileSync('b', 'utf8');",
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test('it counts I/O in a returned named function expression against that function', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      "import { readFileSync } from 'node:fs';",
      '',
      'export function buildReader(): () => string {',
      '  return function readSource() {',
      "    return readFileSync('a', 'utf8');",
      '  };',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test('it counts I/O against the named function that does it, not the one around it', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      "import { readFileSync } from 'node:fs';",
      '',
      'export function buildReader(): () => string {',
      "  const readSource = () => readFileSync('a', 'utf8');",
      '',
      '  return readSource;',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test('it reports a predicate verb that declares a non-boolean return type', async () => {
  const ctx = await setupTest();
  const result = await ctx.lint("export function isReady(): string {\n  return 'yes';\n}\n");

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    "'isReady' starts with 'is', which promises a boolean, but it declares another return type.",
  );
});

test('it accepts a boolean, a type predicate, and a probe that resolves to a boolean', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      'export function isEmpty(text: string): boolean {',
      "  return text === '';",
      '}',
      '',
      'export function isText(value: unknown): value is string {',
      "  return typeof value === 'string';",
      '}',
      '',
      'export async function probeFile(path: string): Promise<boolean> {',
      '  return Bun.file(path).exists();',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test('it reads a local boolean alias as a boolean in both predicate checks', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      'type Flag = boolean;',
      '',
      'export function isReady(state: string): Flag {',
      "  return state === 'ready';",
      '}',
      '',
      'export function matchesReady(state: string): Flag {',
      "  return state === 'ready';",
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).not.toInclude("'isReady'");
  expect(result.stdout).toInclude("'matchesReady' returns a boolean and does no I/O");
});

test('it reports a boolean function with no predicate verb that does no I/O', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    "export function matchesGlob(path: string): boolean {\n  return path.endsWith('.ts');\n}\n",
  );

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    "'matchesGlob' returns a boolean and does no I/O — start its name with `is`, `has`, `can` or `should`.",
  );
});

test('it skips the boolean check for an effectful verb, `try`, and a function that does I/O', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      "import { existsSync } from 'node:fs';",
      '',
      'export function removeEntry(entries: Set<string>, entry: string): boolean {',
      '  return entries.delete(entry);',
      '}',
      '',
      'export function tryLock(locks: Set<string>, name: string): boolean {',
      '  return !locks.has(name);',
      '}',
      '',
      'export function checkPath(path: string): boolean {',
      '  return existsSync(path);',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test('it reports a find whose local interface or alias holds no miss', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      'interface Entry {',
      '  readonly name: string;',
      '}',
      '',
      'type Entries = readonly Entry[];',
      '',
      'export function findEntry(entries: Entries): Entry {',
      "  return entries[0] ?? { name: '' };",
      '}',
      '',
      'export function findEntries(entries: Entries): Entries {',
      '  return entries;',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("'findEntry' starts with 'find', which promises it can miss");
  expect(result.stdout).toInclude("'findEntries' starts with 'find', which promises it can miss");
});

test('it reports a find whose return type holds no miss', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    'export function findFirst(items: readonly number[]): number {\n  return items[0] ?? 0;\n}\n',
  );

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    "'findFirst' starts with 'find', which promises it can miss, but its return type holds no null or undefined",
  );
});

test('it accepts a find that can return undefined, null, an open type, or an alias that holds a miss', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      'export function findFirst(items: readonly number[]): number | undefined {',
      '  return items[0];',
      '}',
      '',
      'export function findLast(items: readonly number[]): number | null {',
      '  return items.at(-1) ?? null;',
      '}',
      '',
      'export function findAny(items: readonly unknown[]): unknown {',
      '  return items[0];',
      '}',
      '',
      'type MaybeNumber = number | undefined;',
      '',
      'export function findSecond(items: readonly number[]): MaybeNumber {',
      '  return items[1];',
      '}',
      '',
      "import type { Entry } from './entry.ts';",
      '',
      'export function findEntry(entries: readonly Entry[]): Entry {',
      '  return entries[0] as Entry;',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test.each([
  [
    'declares null',
    'export function getFirst(items: readonly number[]): number | null {\n  return items[0] ?? null;\n}\n',
  ],
  [
    'returns with no value',
    'export function getFirst(items: readonly number[]) {\n  if (items.length === 0) {\n    return;\n  }\n\n  return items[0];\n}\n',
  ],
  [
    'declares a local alias that holds undefined',
    'type MaybeNumber = number | undefined;\n\nexport function getFirst(items: readonly number[]): MaybeNumber {\n  return items[0];\n}\n',
  ],
  [
    'returns undefined',
    'export function getFirst(items: readonly number[]) {\n  if (items.length === 0) {\n    return undefined;\n  }\n\n  return items[0];\n}\n',
  ],
])('it reports a get that %s', async (_, source) => {
  const ctx = await setupTest();
  const result = await ctx.lint(source);

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    "'getFirst' starts with 'get', which promises it cannot miss, but it can return null or undefined",
  );
});

test('it reports an unannotated get that returns null', async () => {
  const ctx = await setupTest();
  const result = await ctx.lint('export function getEntry() {\n  return null;\n}\n');

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    "'getEntry' starts with 'get', which promises it cannot miss, but it can return null or undefined",
  );
});

test('it accepts a get whose callback returns null', async () => {
  const ctx = await setupTest();

  const result = await ctx.lint(
    [
      'export function getSlots(count: number): null[] {',
      '  return Array.from({ length: count }, () => null);',
      '}',
      '',
    ].join('\n'),
  );

  expect(result.exitCode).toBe(0);
});

test('it holds the same no-I/O verbs as the role table in the shared skill', async () => {
  const ctx = await setupTest();

  const markdown = await readFile(
    join(import.meta.dir, '..', '..', '.claude', 'skills', 'code-style', 'SKILL.md'),
    'utf8',
  );

  const ruleSource = await readFile(join(import.meta.dir, 'verb-contract.js'), 'utf8');

  const rows = [...markdown.matchAll(/^\| [^|]+ \| (?<verbs>[^|]+) \| (?<promise>[^|]+) \|$/gmu)];

  const tableVerbs = rows.flatMap((row) =>
    [...(row.groups?.['verbs'] ?? '').matchAll(/`(?<verb>[a-z]+)`/gu)].map((match) => ({
      verb: match.groups?.['verb'] ?? '',
      promisesNoIO: row.groups?.['promise']?.includes('no I/O') ?? false,
    })),
  );

  const ruleList =
    /const pureVerbs = \[(?<list>[^\]]+)\]/u.exec(ruleSource)?.groups?.['list'] ?? '';

  const ruleVerbs = [...ruleList.matchAll(/'(?<verb>[a-z]+)'/gu)].map(
    (match) => match.groups?.['verb'] ?? '',
  );

  // every verb either side names, so a verb only the rule holds is linted too
  const candidates = new Set([...tableVerbs.map((entry) => entry.verb), ...ruleVerbs]);

  const source = [...candidates]
    .map((verb) => `export async function ${verb}Thing() {}\n`)
    .join('\n');

  const result = await ctx.lint(source);

  const reported = [...result.stdout.matchAll(/'(?<name>[a-z]+Thing)' starts with/gu)].map(
    (match) => match.groups?.['name'],
  );

  expect(tableVerbs.length).toBeGreaterThan(15);
  expect(ruleVerbs.length).toBeGreaterThan(10);

  expect(reported).toIncludeSameMembers(
    tableVerbs.filter((entry) => entry.promisesNoIO).map((entry) => `${entry.verb}Thing`),
  );
});
