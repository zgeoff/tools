import { expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const oxlintBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint');
const pluginPath = join(import.meta.dir, 'plugin.js');
const sharedTaxonomyPath = join(import.meta.dir, '..', '..', 'agents', 'shared.md');

interface LintResult {
  exitCode: number;
  stdout: string;
  output: string;
}

type RuleSettings = Readonly<Record<string, unknown>>;

async function createLintTree(source: string, rules: RuleSettings): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'oxlint-config-test-'));

  const config = { jsPlugins: [pluginPath], rules };

  await writeFile(join(dir, '.oxlintrc.json'), JSON.stringify(config));
  await writeFile(join(dir, 'sample.ts'), source);

  return dir;
}

async function runLint(source: string, fix: boolean, rules?: RuleSettings): Promise<LintResult> {
  const dir = await createLintTree(source, rules ?? { 'zgeoff/no-single-line-jsdoc': 'error' });

  const fixArgs = fix ? ['--fix'] : [];
  const args = [oxlintBin, '-c', '.oxlintrc.json', ...fixArgs, 'sample.ts'];
  const proc = Bun.spawn(args, { cwd: dir, stdout: 'pipe', stderr: 'pipe' });

  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  const output = await readFile(join(dir, 'sample.ts'), 'utf8');

  return { exitCode, stdout, output };
}

/**
 * Collects the allowed verbs from the taxonomy tables in the shared agents
 * partial: every table row between the section heading and the banned
 * paragraph, with `<X>` templates reduced to their leading verb.
 */
function collectTaxonomyVerbs(markdown: string): string[] {
  const start = markdown.indexOf('### Function naming');
  const end = markdown.indexOf('**Banned**');
  const section = markdown.slice(start, end);
  const verbs = section.match(/(?<=^\| `)[a-z]+/gmu) ?? [];

  return [...new Set(verbs)];
}

/**
 * Collects the banned verbs from the shared agents partial: the backticked
 * words in the banned paragraph, excluding parenthesized asides (replacement
 * pointers and the framework-convention carve-out).
 */
function collectBannedVerbs(markdown: string): string[] {
  const start = markdown.indexOf('**Banned**');
  const end = markdown.indexOf('Algorithm-native');
  const paragraph = markdown.slice(start, end);
  const banned: string[] = [];

  for (const match of paragraph.matchAll(/`(?<verb>[a-z]+)`/gu)) {
    const preceding = paragraph.slice(0, match.index);
    const verb = match.groups?.['verb'];

    if (
      verb !== undefined &&
      countOccurrences(preceding, '(') === countOccurrences(preceding, ')')
    ) {
      banned.push(verb);
    }
  }

  return banned;
}

function countOccurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

test('it flags a single-line JSDoc block', async () => {
  const result = await runLint('/** Documents the export. */\nexport const answer = 42;\n', false);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-single-line-jsdoc');
});

test('it expands a single-line block to multi-line under --fix', async () => {
  const result = await runLint('/** Documents the export. */\nexport const answer = 42;\n', true);

  expect(result.exitCode).toBe(0);
  expect(result.output).toBe('/**\n * Documents the export.\n */\nexport const answer = 42;\n');
});

test('it preserves indentation when fixing an indented block', async () => {
  const source = 'class Box {\n  /** Holds the value. */\n  value = 1;\n}\n';

  const result = await runLint(source, true);

  expect(result.exitCode).toBe(0);
  expect(result.output).toBe('class Box {\n  /**\n   * Holds the value.\n   */\n  value = 1;\n}\n');
});

test('it leaves multi-line blocks, line comments, and plain block comments alone', async () => {
  const source = [
    '/**',
    ' * Already multi-line.',
    ' */',
    'export const a = 1;',
    '',
    '// line comment',
    'export const b = 2;',
    '',
    '/* plain block */',
    'export const c = 3;',
    '',
  ].join('\n');

  const result = await runLint(source, false);

  expect(result.exitCode).toBe(0);
});

test('it exempts inline @type and @lends casts', async () => {
  const source = 'export const config = /** @type {const} */ ({ port: 3000 });\n';

  const result = await runLint(source, false);

  expect(result.exitCode).toBe(0);
});

test('it reports but does not fix a block sharing its line with code', async () => {
  const source =
    'export function isReady(/** milliseconds */ delay: number): boolean {\n  return delay > 0;\n}\n';

  const result = await runLint(source, true);

  expect(result.exitCode).toBe(1);
  expect(result.output).toBe(source);
});

test('it flags a function whose name lacks a taxonomy verb', async () => {
  const source = 'export function grabConfig(): number {\n  return 1;\n}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('function-verb');
  expect(result.stdout).toInclude('grabConfig');
});

test('it points a banned verb at its replacement', async () => {
  const source = 'export function fetchUser(): number {\n  return 1;\n}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("banned verb 'fetch'");
  expect(result.stdout).toInclude('`read`');
});

test('it tells a vague banned verb to name what the function does', async () => {
  const source = 'export function processInput(): number {\n  return 1;\n}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('name what the function does');
});

test('it accepts taxonomy verbs on declarations, const functions, and class methods', async () => {
  const source = [
    'export function buildThing(): number {',
    '  return 1;',
    '}',
    '',
    'export function withScope(run: () => void): void {',
    '  const applyAll = () => run();',
    '',
    '  applyAll();',
    '}',
    '',
    'export class Box {',
    '  updateValue(): void {}',
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it requires a suffix on templated verbs', async () => {
  const bare = 'export const handle = (): void => {};\n';
  const suffixed = 'export function handleRowClick(): void {}\n';

  const bareResult = await runLint(bare, false, { 'zgeoff/function-verb': 'error' });
  const suffixedResult = await runLint(suffixed, false, { 'zgeoff/function-verb': 'error' });

  expect(bareResult.exitCode).toBe(1);
  expect(suffixedResult.exitCode).toBe(0);
});

test('it matches a verb only at a camelCase boundary', async () => {
  const source = 'export function tokenize(): number {\n  return 1;\n}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
});

test('it skips PascalCase names, object-literal properties, getters, and setters', async () => {
  const source = [
    'export function Component(): null {',
    '  return null;',
    '}',
    '',
    'export const visitor = {',
    '  enter(): void {},',
    '};',
    '',
    'export class Box {',
    '  get value(): number {',
    '    return 1;',
    '  }',
    '',
    '  set value(next: number) {}',
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it accepts repo-local verbs added through the verbs option', async () => {
  const source = 'export function walkTree(): void {}\n';

  const bareRule = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  const extended = await runLint(source, false, {
    'zgeoff/function-verb': ['error', { verbs: ['walk'] }],
  });

  expect(bareRule.exitCode).toBe(1);
  expect(extended.exitCode).toBe(0);
});

test('it skips names listed in the exemptNames option', async () => {
  const source = 'export function main(): void {}\n';

  const result = await runLint(source, false, {
    'zgeoff/function-verb': ['error', { exemptNames: ['main'] }],
  });

  expect(result.exitCode).toBe(0);
});

test('it accepts every verb in the shared taxonomy', async () => {
  const markdown = await readFile(sharedTaxonomyPath, 'utf8');

  const verbs = collectTaxonomyVerbs(markdown);

  expect(verbs.length).toBeGreaterThan(40);

  const lines = verbs.map((verb) => `export function ${verb}Thing(): void {}`);

  const result = await runLint(`${lines.join('\n')}\n`, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it rejects every verb the shared taxonomy bans', async () => {
  const markdown = await readFile(sharedTaxonomyPath, 'utf8');

  const banned = collectBannedVerbs(markdown).filter((verb) => verb !== 'handle');

  expect(banned.length).toBeGreaterThan(10);

  const lines = banned.map((verb) => `export function ${verb}Thing(): void {}`);

  const result = await runLint(`${lines.join('\n')}\n`, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);

  for (const verb of banned) {
    expect(result.stdout).toInclude(`${verb}Thing`);
  }
});
