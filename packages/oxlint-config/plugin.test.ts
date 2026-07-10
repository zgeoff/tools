import { expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const oxlintBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint');
const pluginPath = join(import.meta.dir, 'plugin.js');

interface LintResult {
  exitCode: number;
  stdout: string;
  output: string;
}

async function createLintTree(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'oxlint-config-test-'));

  const config = {
    jsPlugins: [pluginPath],
    rules: { 'zgeoff/no-single-line-jsdoc': 'error' },
  };

  await writeFile(join(dir, '.oxlintrc.json'), JSON.stringify(config));
  await writeFile(join(dir, 'sample.ts'), source);

  return dir;
}

async function runLint(source: string, fix: boolean): Promise<LintResult> {
  const dir = await createLintTree(source);

  const fixArgs = fix ? ['--fix'] : [];
  const args = [oxlintBin, '-c', '.oxlintrc.json', ...fixArgs, 'sample.ts'];
  const proc = Bun.spawn(args, { cwd: dir, stdout: 'pipe', stderr: 'pipe' });

  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  const output = await readFile(join(dir, 'sample.ts'), 'utf8');

  return { exitCode, stdout, output };
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
