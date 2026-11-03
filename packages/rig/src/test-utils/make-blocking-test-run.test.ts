import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/std/test-utils/read-run-folder-prefix';
import { makeBlockingTestRun } from './make-blocking-test-run.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('blocking-test-run-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it replaces the folder with a file, so a removal inside it fails with ENOTDIR, and passes', async () => {
  const ctx = await setupTest();

  const chromeDir = join(ctx.directory, 'chrome');

  await mkdir(join(chromeDir, '4417'), { recursive: true });

  const exitCode = await makeBlockingTestRun(chromeDir)();

  const removal = await rm(join(chromeDir, '4417'), { recursive: true, force: true }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(exitCode).toBe(0);
  expect(removal).toMatchObject({ code: 'ENOTDIR' });
});
