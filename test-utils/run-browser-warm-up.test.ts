import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBrowserWarmUp } from './run-browser-warm-up.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-browser-warm-up-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const chromeRunsDir = join(directory, 'chrome-runs');

  await mkdir(chromeRunsDir);

  return { repoRoot: join(directory, 'warm-up'), chromeRunsDir };
}

test('it rejects a warm-up whose browser run exits 0 without running a browser test', async () => {
  const ctx = await setupTest();

  const failure = runBrowserWarmUp(ctx.repoRoot, ctx.chromeRunsDir, {
    runRigBrowser: () => Promise.resolve(),
  });

  await expect(failure).rejects.toThrow(new Error('the Chrome warm-up ran no browser test'));
});

test('it removes the Chrome runs folder after a warm-up that ran no browser test', async () => {
  const ctx = await setupTest();

  await runBrowserWarmUp(ctx.repoRoot, ctx.chromeRunsDir, {
    runRigBrowser: () => Promise.resolve(),
  }).catch(() => null);

  expect(existsSync(ctx.chromeRunsDir)).toBeFalse();
});

test('it resolves a warm-up whose browser test wrote its mark, and removes the Chrome runs folder', async () => {
  const ctx = await setupTest();

  await runBrowserWarmUp(ctx.repoRoot, ctx.chromeRunsDir, {
    runRigBrowser: () => writeFile(join(ctx.repoRoot, 'warm-up.mark'), ''),
  });

  expect(existsSync(ctx.chromeRunsDir)).toBeFalse();
});

test('it removes the Chrome runs folder when the browser run fails', async () => {
  const ctx = await setupTest();

  const failure = await runBrowserWarmUp(ctx.repoRoot, ctx.chromeRunsDir, {
    runRigBrowser: () => Promise.reject(new Error('rig browser exited 1')),
  }).catch((error: unknown) => error);

  expect(failure).toHaveProperty('message', 'rig browser exited 1');
  expect(existsSync(ctx.chromeRunsDir)).toBeFalse();
});
