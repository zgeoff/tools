import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const oxlintBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint');
const configPath = join(import.meta.dir, 'oxlintrc.json');

function createLongSource(lineCount: number): string {
  const lines = Array.from({ length: lineCount }, (_, index) => `export const value${index} = 0;`);

  return `${lines.join('\n')}\n`;
}

async function setupTest(fileName: string) {
  const dir = await mkdtemp(join(tmpdir(), 'oxlintrc-test-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, fileName), createLongSource(501));

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
  const ctx = await setupTest(fileName);
  const stdout = await runLint(ctx.dir, fileName);

  expect(stdout.includes('eslint(max-lines)')).toBe(expected);
});
