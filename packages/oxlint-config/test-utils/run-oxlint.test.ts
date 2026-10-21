import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOxlint } from './run-oxlint.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-oxlint-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it gives exit code 1 and the report for a file with a problem', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'kettle.js'), 'debugger;\n');

  const run = await runOxlint(['-A', 'all', '-D', 'no-debugger', 'kettle.js'], ctx.directory);

  expect(run.exitCode).toBe(1);
  expect(run.stdout).toInclude('no-debugger');
});

test('it gives exit code 0 for a clean file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'kettle.js'), 'export const cups = 2;\n');

  const run = await runOxlint(['-A', 'all', '-D', 'no-debugger', 'kettle.js'], ctx.directory);

  expect(run.exitCode).toBe(0);
});
