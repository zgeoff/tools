import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileLocks } from './file-locks.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'file-locks-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { lockPath: join(directory, 'bundle.lock') };
}

test('it gives the lock to one open file at a time, and frees it when that file closes', async () => {
  const ctx = await setupTest();
  const first = await fileLocks.openLockFile(ctx.lockPath);

  // A second close of the same file handle resolves, so the test's own close of the first file
  // and this fallback can both run.
  onTestFinished(() => fileLocks.closeLockFile(first));

  const second = await fileLocks.openLockFile(ctx.lockPath);

  onTestFinished(() => fileLocks.closeLockFile(second));

  const isFirstLocked = fileLocks.tryLock(first);
  const isSecondLockedWhileHeld = fileLocks.tryLock(second);

  await fileLocks.closeLockFile(first);

  expect(isFirstLocked).toBeTrue();
  expect(isSecondLockedWhileHeld).toBeFalse();
  expect(fileLocks.tryLock(second)).toBeTrue();
});
