import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeBunScriptRunner } from './make-bun-script-runner.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-make-bun-script-runner-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it runs a package script through bun run and returns its exit code', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'echo lint >> ran && exit 3' } }),
  );

  const runScript = makeBunScriptRunner(ctx.directory, process.env);

  const exitCode = await runScript('lint');
  const ran = await readFile(join(ctx.directory, 'ran'), 'utf8');

  expect(exitCode).toBe(3);
  expect(ran).toBe('lint\n');
});
