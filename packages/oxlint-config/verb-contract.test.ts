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
  [
    'an async no-I/O function',
    `export async function buildThing(): Promise<number> {
  return 1;
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it is async",
  ],
  [
    'an await inside an unnamed callback',
    `export function buildThing(): void {
  void (async () => {
    await Promise.resolve();
  })();
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it awaits",
  ],
  [
    'a named import from node:fs',
    `import { existsSync } from 'node:fs';

export function buildThing(): boolean {
  return existsSync('a');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `existsSync` from `node:fs`",
  ],
  [
    'a default import from node:fs/promises',
    `import fs from 'node:fs/promises';

export function buildThing(): void {
  void fs.rm('a');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `fs` from `node:fs/promises`",
  ],
  [
    'a namespace import from node:fs',
    `import * as fs from 'node:fs';

export function buildThing(): string {
  return fs.readFileSync('a', 'utf8');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `fs` from `node:fs`",
  ],
  [
    'a local alias of a node:fs member',
    `import fs from 'node:fs';

export function buildThing(): string {
  const read = fs.readFileSync;

  return read('a', 'utf8');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `read` from `node:fs`",
  ],
  [
    'a named import from node:child_process',
    `import { execSync } from 'node:child_process';

export function buildThing(): void {
  execSync('ls');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `execSync` from `node:child_process`",
  ],
  [
    'Bun.spawn',
    `export function buildThing(): void {
  Bun.spawn(['ls']);
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `Bun.spawn`",
  ],
  [
    'Bun.file in a concise arrow',
    `export const buildThing = (): unknown => Bun.file('a');
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `Bun.file`",
  ],
  [
    'Bun.write',
    `export function buildThing(): void {
  void Bun.write('a', 'b');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `Bun.write`",
  ],
  [
    'a destructured alias of Bun.spawn',
    `export function buildThing(): void {
  const { spawn: launch } = Bun;

  launch(['ls']);
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `Bun.spawn`",
  ],
  [
    'a named import of spawn from bun',
    `import { spawn } from 'bun';

export function buildThing(): void {
  spawn(['ls']);
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `spawn` from `bun`",
  ],
  [
    'spawn through a namespace import of bun',
    `import * as bun from 'bun';

export function buildThing(): void {
  bun.spawn(['ls']);
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `bun` from `bun`",
  ],
  [
    'a named import of the $ shell',
    `import { $ } from 'bun';

export function buildThing(): unknown {
  return $\`ls\`;
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a `$` shell command",
  ],
  [
    'a call on the $ shell',
    `import { $ } from 'bun';

export function buildThing(): unknown {
  return $.cwd('a');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a `$` shell command",
  ],
  [
    'an aliased import of the $ shell',
    `import { $ as shell } from 'bun';

export function buildThing(): unknown {
  return shell\`ls\`;
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a `$` shell command",
  ],
  [
    'a local alias of the $ shell',
    `import { $ as shell } from 'bun';

export function buildThing(): unknown {
  const run = shell;

  return run\`ls\`;
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a `$` shell command",
  ],
  [
    'the $ shell through a namespace import of bun',
    `import * as bun from 'bun';

export function buildThing(): unknown {
  return bun.$\`ls\`;
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a `$` shell command",
  ],
  [
    'the $ shell through a default import of bun',
    `import bun from 'bun';

export function buildThing(): unknown {
  return bun.$\`ls\`;
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a `$` shell command",
  ],
  [
    'Bun.$',
    `export function buildThing(): unknown {
  return Bun.$\`ls\`;
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a `$` shell command",
  ],
  [
    'a configured $ shell through a namespace import as a template tag',
    `import * as bun from 'bun';

export function buildThing(): unknown {
  return bun.$.cwd('a')\`ls\`;
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a `$` shell command",
  ],
  [
    'the global fetch',
    `export function buildThing(): unknown {
  return fetch('https://a.test');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls `fetch`",
  ],
  [
    'a Kysely query',
    `export function buildThing(db: { selectFrom(table: string): { execute(): unknown } }): unknown {
  return db.selectFrom('users').execute();
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it runs a database query",
  ],
  [
    'a read of process.env',
    `export function buildThing(): string {
  return process.env['HOME'] ?? '';
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it reads the environment",
  ],
  [
    'a read of Bun.env',
    `export function buildThing(): string {
  return Bun.env['HOME'] ?? '';
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it reads the environment",
  ],
  [
    'a local helper with an effectful verb',
    `function readConfig(): string {
  return '';
}

export function buildThing(): string {
  return readConfig();
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls 'readConfig', whose verb may do I/O",
  ],
  [
    'a local alias of a helper with an effectful verb',
    `function readConfig(): string {
  return '';
}

export function buildThing(): string {
  const go = readConfig;

  return go();
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls 'readConfig', whose verb may do I/O",
  ],
  [
    'a parameter method with an effectful verb',
    `export function buildThing(ctx: { writeText(text: string): void }): void {
  ctx.writeText('a');
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls 'writeText', whose verb may do I/O",
  ],
  [
    'a method on this with an effectful verb',
    `export const logger = {
  writeLine(): void {},
  buildThing(): void {
    this.writeLine();
  },
};
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls 'writeLine', whose verb may do I/O",
  ],
  [
    'a relative import with an effectful verb',
    `import { loadReport } from './load-report.ts';

export function buildThing(): string {
  return loadReport();
}
`,
    "'buildThing' starts with 'build', which promises no I/O, but it calls 'loadReport', whose verb may do I/O",
  ],
  [
    'a returned named function expression that does I/O',
    `import { readFileSync } from 'node:fs';

export function makeReader(): () => string {
  return function buildSource() {
    return readFileSync('a', 'utf8');
  };
}
`,
    "'buildSource' starts with 'build', which promises no I/O, but it calls `readFileSync` from `node:fs`",
  ],
  [
    'a predicate that declares a string',
    `export function isReady(): string {
  return 'yes';
}
`,
    "'isReady' starts with 'is', which promises a boolean, but it declares another return type.",
  ],
  [
    'a predicate that declares a local interface',
    `interface State {
  readonly ready: boolean;
}

export function isReady(state: State): State {
  return state;
}
`,
    "'isReady' starts with 'is', which promises a boolean, but it declares another return type.",
  ],
  [
    'a pure boolean function with a free verb',
    `export function matchesGlob(path: string): boolean {
  return path.endsWith('.ts');
}
`,
    "'matchesGlob' returns a boolean and does no I/O",
  ],
  [
    'a pure function that declares a local boolean alias',
    `type Flag = boolean;

export function matchesReady(state: string): Flag {
  return state === 'ready';
}
`,
    "'matchesReady' returns a boolean and does no I/O",
  ],
  [
    'a pure boolean concise arrow with a free verb',
    `export const matchesSource = (path: string): boolean => path.endsWith('.ts');
`,
    "'matchesSource' returns a boolean and does no I/O",
  ],
  [
    'a find that declares a number',
    `export function findFirst(items: readonly number[]): number {
  return items[0] ?? 0;
}
`,
    "'findFirst' starts with 'find', which promises it can miss",
  ],
  [
    'a find that declares a local interface',
    `interface Entry {
  readonly name: string;
}

export function findEntry(entries: readonly Entry[]): Entry {
  return entries[0] ?? { name: '' };
}
`,
    "'findEntry' starts with 'find', which promises it can miss",
  ],
  [
    'a find that declares a local alias of a readonly array',
    `interface Entry {
  readonly name: string;
}

type Entries = readonly Entry[];

export function findEntries(entries: Entries): Entries {
  return entries;
}
`,
    "'findEntries' starts with 'find', which promises it can miss",
  ],
  [
    'a get that declares null',
    `export function getFirst(items: readonly number[]): number | null {
  return items[0] ?? null;
}
`,
    "'getFirst' starts with 'get', which promises it cannot miss",
  ],
  [
    'a get that declares a local alias holding undefined',
    `type MaybeNumber = number | undefined;

export function getFirst(items: readonly number[]): MaybeNumber {
  return items[0];
}
`,
    "'getFirst' starts with 'get', which promises it cannot miss",
  ],
  [
    'an unannotated get that returns null',
    `export function getEntry() {
  return null;
}
`,
    "'getEntry' starts with 'get', which promises it cannot miss",
  ],
  [
    'an unannotated get that returns undefined',
    `export function getFirst(items: readonly number[]) {
  if (items.length === 0) {
    return undefined;
  }

  return items[0];
}
`,
    "'getFirst' starts with 'get', which promises it cannot miss",
  ],
  [
    'an unannotated get with a bare return',
    `export function getFirst(items: readonly number[]) {
  if (items.length === 0) {
    return;
  }

  return items[0];
}
`,
    "'getFirst' starts with 'get', which promises it cannot miss",
  ],
  [
    'a concise get arrow that returns null',
    `export const getEntry = () => null;
`,
    "'getEntry' starts with 'get', which promises it cannot miss",
  ],
  [
    'a concise get arrow that returns undefined',
    `export const getEntry = () => undefined;
`,
    "'getEntry' starts with 'get', which promises it cannot miss",
  ],
])('it reports %s', async (_, source, message) => {
  const ctx = await setupTest();
  const result = await ctx.lint(source);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude(message);
});

test.each([
  [
    'a callee imported from a package',
    `import { readPackageUp } from 'read-package-up';

export function buildThing(): unknown {
  return readPackageUp();
}
`,
  ],
  [
    'a local alias of a callee imported from a package',
    `import { readThing } from 'third-party';

export function buildThing(): unknown {
  const read = readThing;

  return read();
}
`,
  ],
  [
    'a bare built-in method and a method on a value the function makes',
    `export function buildIndex(names: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();
  const date = new Date(0);

  date.setUTCDate(2);

  for (const name of names) {
    index.set(name, date.getUTCDate());
  }

  return index;
}
`,
  ],
  [
    'a local alias of a method on a value the function makes',
    `export function buildValue(): number {
  const state = { setValue: (next: number) => next };
  const invoke = state.setValue;

  return invoke(1);
}
`,
  ],
  [
    'a bare built-in method on a parameter',
    `export function buildIndex(index: Map<string, number>, names: readonly string[]): number {
  for (const name of names) {
    index.set(name, name.length);
  }

  return index.size;
}
`,
  ],
  [
    'a parameter named $',
    `export function buildThing($: (text: string) => string): string {
  return $('a');
}
`,
  ],
  [
    'a parameter named fs',
    `export function buildThing(fs: { existsSync(path: string): boolean }): string {
  return fs.existsSync('a') ? 'found' : 'missing';
}
`,
  ],
  [
    'a parameter named fetch',
    `export function buildThing(fetch: (url: string) => string): string {
  return fetch('a');
}
`,
  ],
  [
    'a parameter named process',
    `export function buildThing(process: { env: Record<string, string> }): string {
  return process.env['HOME'] ?? '';
}
`,
  ],
  [
    'a local named Bun',
    `export function buildThing(): number {
  const Bun = { file: (path: string) => path.length };

  return Bun.file('a');
}
`,
  ],
  [
    'I/O behind a verb that may do I/O and behind a free verb',
    `import { readFileSync } from 'node:fs';

export async function readConfig(): Promise<string> {
  return readFileSync('a', 'utf8');
}

export function resolveConfigPath(): string {
  return process.env['CONFIG'] ?? readFileSync('b', 'utf8');
}
`,
  ],
  [
    'I/O in a named inner function that the outer function only returns',
    `import { readFileSync } from 'node:fs';

export function buildReader(): () => string {
  const readSource = () => readFileSync('a', 'utf8');

  return readSource;
}
`,
  ],
  [
    'I/O in a returned named function expression with an effectful name',
    `import { readFileSync } from 'node:fs';

export function buildReader(): () => string {
  return function readSource() {
    return readFileSync('a', 'utf8');
  };
}
`,
  ],
  [
    'predicates that declare a boolean, a type predicate, or a probe promise',
    `export function isEmpty(text: string): boolean {
  return text === '';
}

export function isText(value: unknown): value is string {
  return typeof value === 'string';
}

export async function probeFile(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}
`,
  ],
  [
    'a predicate that declares a local boolean alias',
    `type Flag = boolean;

export function isReady(state: string): Flag {
  return state === 'ready';
}
`,
  ],
  [
    'predicates that declare an indexed access, an imported type, or a type parameter',
    `import type { Ready } from './ready.ts';

interface State {
  readonly ready: boolean;
}

export function isReady(state: State): State['ready'] {
  return state.ready;
}

export function isSettled(state: State): Ready {
  return state.ready;
}

export function isFlag<T extends boolean>(flag: T): T {
  return flag;
}
`,
  ],
  [
    'a predicate and a find that declare a type from a namespace import',
    `import type * as Types from './types.ts';

export function isReady(state: Types.State): Types.Ready {
  return state.ready;
}

export function findEntry(entries: readonly Types.Entry[]): Types.Entry {
  return entries[0] as Types.Entry;
}
`,
  ],
  [
    'boolean functions with an effectful verb, try, or I/O',
    `import { existsSync } from 'node:fs';

export function removeEntry(entries: Set<string>, entry: string): boolean {
  return entries.delete(entry);
}

export function tryLock(locks: Set<string>, name: string): boolean {
  return !locks.has(name);
}

export function checkPath(path: string): boolean {
  return existsSync(path);
}
`,
  ],
  [
    'boolean functions with a framework prefix',
    `import { useContext } from 'react';
import type { Context } from 'react';

export function useReady(context: Context<boolean>): boolean {
  return useContext(context);
}

export function onKeyDown(key: string): boolean {
  return key === 'Enter';
}

export function handleKeyDown(key: string): boolean {
  return key === 'Enter';
}
`,
  ],
  [
    'finds that can miss or whose type the rule cannot see',
    `import type { Entry } from './entry.ts';

type MaybeNumber = number | undefined;

export function findFirst(items: readonly number[]): number | undefined {
  return items[0];
}

export function findLast(items: readonly number[]): number | null {
  return items.at(-1) ?? null;
}

export function findAny(items: readonly unknown[]): unknown {
  return items[0];
}

export function findSecond(items: readonly number[]): MaybeNumber {
  return items[1];
}

export function findEntry(entries: readonly Entry[]): Entry {
  return entries[0] as Entry;
}

export function findItem<T>(items: readonly T[]): T {
  return items[0] as T;
}

export function findIndexed(entries: readonly Entry[]): (typeof entries)[number] {
  return entries[0] as Entry;
}
`,
  ],
  [
    'gets that cannot miss or whose type the rule cannot see',
    `import type { Entry } from './entry.ts';

export function getSlots(count: number): null[] {
  return Array.from({ length: count }, () => null);
}

export function getEntry(entries: readonly Entry[]): Entry {
  return entries[0] as Entry;
}

export function getItem<T>(items: readonly T[]): T {
  return items[0] as T;
}

export const getName = (entry: { name: string }): string => entry.name;
`,
  ],
])('it accepts %s', async (_, source) => {
  const ctx = await setupTest();
  const result = await ctx.lint(source);

  expect(result.stdout).not.toInclude('zgeoff(verb-contract)');
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
