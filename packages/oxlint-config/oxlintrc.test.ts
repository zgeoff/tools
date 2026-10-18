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
