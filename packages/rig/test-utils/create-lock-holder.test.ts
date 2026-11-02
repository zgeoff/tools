import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLockHolder } from './create-lock-holder.ts';
import { fileLocks } from './file-locks.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'lock-holder-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { lockPath: join(directory, 'bundle.lock') };
}

test('it holds the lock until it is killed', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  const lockFile = await fileLocks.openLockFile(ctx.lockPath);

  onTestFinished(() => fileLocks.closeLockFile(lockFile));

  const isLockedWhileHeld = fileLocks.tryLock(lockFile);

  await holder.kill();

  expect(isLockedWhileHeld).toBeFalse();
  expect(fileLocks.tryLock(lockFile)).toBeTrue();
});

test('it fails when another holder keeps the lock', async () => {
  const ctx = await setupTest();
  const lockFile = await fileLocks.openLockFile(ctx.lockPath);

  onTestFinished(() => fileLocks.closeLockFile(lockFile));

  const isLocked = fileLocks.tryLock(lockFile);

  expect(isLocked).toBeTrue();

  expect(createLockHolder(ctx.lockPath)).rejects.toThrowWithMessage(
    Error,
    `the lock holder could not take the lock ${ctx.lockPath}: busy\n`,
  );
});
