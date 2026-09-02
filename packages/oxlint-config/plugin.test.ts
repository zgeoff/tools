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

async function runLint(source: string, fix: boolean, rules: RuleSettings): Promise<LintResult> {
  const dir = await createLintTree(source, rules);

  const fixArgs = fix ? ['--fix'] : [];
  const args = [oxlintBin, '-c', '.oxlintrc.json', ...fixArgs, 'sample.ts'];
  const proc = Bun.spawn(args, { cwd: dir, stdout: 'pipe', stderr: 'pipe' });

  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  const output = await readFile(join(dir, 'sample.ts'), 'utf8');

  return { exitCode, stdout, output };
}

function collectTaxonomyVerbs(markdown: string): string[] {
  const start = markdown.indexOf('### Function naming');
  const end = markdown.indexOf('**Banned**');
  const section = markdown.slice(start, end);
  const verbs = section.match(/(?<=^\| `)[a-z]+/gmu) ?? [];

  return [...new Set(verbs)];
}

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

const noJSDoc = { 'zgeoff/no-jsdoc': 'error' };
const maxRun = { 'zgeoff/max-consecutive-line-comments': 'error' };

test('it flags a multi-line JSDoc block', async () => {
  const source = '/**\n * Documents the export.\n */\nexport const answer = 42;\n';

  const result = await runLint(source, false, noJSDoc);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});

test('it flags a single-line JSDoc block', async () => {
  const result = await runLint(
    '/** Documents the export. */\nexport const answer = 42;\n',
    false,
    noJSDoc,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});

test('it flags a JSDoc block inside a class body', async () => {
  const source = 'class Box {\n  /**\n   * Holds the value.\n   */\n  value = 1;\n}\n';

  const result = await runLint(source, false, noJSDoc);

  expect(result.exitCode).toBe(1);
});

test('it leaves line comments and plain block comments alone', async () => {
  const source = [
    '// line comment',
    'export const b = 2;',
    '',
    '/* plain block */',
    'export const c = 3;',
    '',
    '/*',
    ' * plain multi-line block',
    ' */',
    'export const d = 4;',
    '',
  ].join('\n');

  const result = await runLint(source, false, noJSDoc);

  expect(result.exitCode).toBe(0);
});

test('it exempts inline @type and @lends casts', async () => {
  const source = 'export const config = /** @type {const} */ ({ port: 3000 });\n';

  const result = await runLint(source, false, noJSDoc);

  expect(result.exitCode).toBe(0);
});

test('it flags a run of four line comments and accepts three', async () => {
  const four = '// one\n// two\n// three\n// four\nexport const a = 1;\n';
  const three = '// one\n// two\n// three\nexport const a = 1;\n';

  const fourResult = await runLint(four, false, maxRun);
  const threeResult = await runLint(three, false, maxRun);

  expect(fourResult.exitCode).toBe(1);
  expect(fourResult.stdout).toInclude('max-consecutive-line-comments');
  expect(fourResult.stdout).toInclude('4 lines; the limit is 3');
  expect(threeResult.exitCode).toBe(0);
});

test('it honours the max option', async () => {
  const source = '// one\n// two\nexport const a = 1;\n';

  const result = await runLint(source, false, {
    'zgeoff/max-consecutive-line-comments': ['error', { max: 1 }],
  });

  expect(result.exitCode).toBe(1);
});

test('it ends a run at a blank line, a statement, or a trailing comment', async () => {
  const source = [
    '// one',
    '// two',
    '',
    '// three',
    '// four',
    'export const a = 1; // trailing',
    '// five',
    '// six',
    '',
  ].join('\n');

  const result = await runLint(source, false, maxRun);

  expect(result.exitCode).toBe(0);
});

test('it neither counts a tool directive nor joins the prose around it', async () => {
  const source = [
    '// one',
    '// two',
    '// oxlint-disable-next-line no-console -- baseline',
    '// three',
    '// four',
    'console.log(1);',
    '',
  ].join('\n');

  const result = await runLint(source, false, maxRun);

  expect(result.exitCode).toBe(0);
});

test('it counts an indented run inside a block', async () => {
  const source = [
    'export function run(): void {',
    '  // one',
    '  // two',
    '  // three',
    '  // four',
    '  return;',
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, false, maxRun);

  expect(result.exitCode).toBe(1);
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

test('it accepts a digit as the boundary after a verb', async () => {
  const source = [
    'export function run2FA(): void {}',
    '',
    'export function get2FAVerificationURI(): string {',
    "  return '';",
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it flags a banned verb at a digit boundary', async () => {
  const source = 'export function save2FABackupCodes(): void {}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("banned verb 'save'");
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
