import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPackageScripts } from './run-package-scripts.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-package-scripts-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const readRan = () => readFile(join(directory, 'ran'), 'utf8');

  return { directory, readRan };
}

test('it runs each listed script in order', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { lint: 'echo lint >> ran', check: 'echo check >> ran', test: 'echo test >> ran' },
    }),
  );

  const exitCode = await runPackageScripts({
    cwd: ctx.directory,
    env: process.env,
    scripts: ' lint check test ',
  });

  const ran = await ctx.readRan();

  expect(exitCode).toBe(0);
  expect(ran).toBe('lint\ncheck\ntest\n');
});

test('it stops at the first script that fails and returns its exit code', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { lint: 'echo lint >> ran && exit 3', test: 'echo test >> ran' },
    }),
  );

  const exitCode = await runPackageScripts({
    cwd: ctx.directory,
    env: process.env,
    scripts: ' lint test ',
  });

  const ran = await ctx.readRan();

  expect(exitCode).toBe(3);
  expect(ran).toBe('lint\n');
});

test('it runs nothing for an empty list', async () => {
  const ctx = await setupTest();
  const exitCode = await runPackageScripts({ cwd: ctx.directory, env: process.env, scripts: '  ' });
  const ran = await Bun.file(join(ctx.directory, 'ran')).exists();

  expect(exitCode).toBe(0);
  expect(ran).toBeFalse();
});
