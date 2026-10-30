import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeBlockingTestRun } from './make-blocking-test-run.ts';

test('it replaces the folder with a file, so a removal inside it fails with ENOTDIR, and passes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blocking-test-run-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const chromeDir = join(directory, 'chrome');

  await mkdir(join(chromeDir, '4417'), { recursive: true });

  const exitCode = await makeBlockingTestRun(chromeDir)();

  const removal = await rm(join(chromeDir, '4417'), { recursive: true, force: true }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(exitCode).toBe(0);
  expect(removal).toMatchObject({ code: 'ENOTDIR' });
});
