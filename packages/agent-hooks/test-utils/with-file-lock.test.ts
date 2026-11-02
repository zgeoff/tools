import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSignallingClock } from './build-signalling-clock.ts';
import { buildSteppingClock } from './build-stepping-clock.ts';
import { createBlockingStubKit } from './create-blocking-stub-kit.ts';
import { createLockHolder } from './create-lock-holder.ts';
import { fileLocks } from './file-locks.ts';
import { makeRejectingStub } from './make-rejecting-stub.ts';
import { makeResolvingStub } from './make-resolving-stub.ts';
import { systemClock } from './system-clock.ts';
import { withFileLock } from './with-file-lock.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'file-lock-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { lockPath: join(directory, 'bundle.lock') };
}

test('it runs a second caller only once the first one releases the lock', async () => {
  const ctx = await setupTest();

  const firstTask = createBlockingStubKit(undefined);
  const secondTask = makeResolvingStub(undefined);

  const first = withFileLock(
    ctx.lockPath,
    { locks: fileLocks, clock: systemClock, retryMs: 5, waitDeadlineMs: 5000 },
    firstTask.stub,
  );

  await firstTask.firstCall;

  const signalling = buildSignallingClock();

  const second = withFileLock(
    ctx.lockPath,
    { locks: fileLocks, clock: signalling.clock, retryMs: 5, waitDeadlineMs: 5000 },
    secondTask,
  );

  await signalling.firstSleep;

  const hasSecondRunWhileHeld = secondTask.mock.calls.length > 0;

  firstTask.release();

  await Promise.all([first, second]);

  expect(hasSecondRunWhileHeld).toBeFalse();
  expect(secondTask).toHaveBeenCalledOnce();
});

test('it takes the lock once a holder that dies frees it', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  const signalling = buildSignallingClock();
  const task = makeResolvingStub('built');

  const locked = withFileLock(
    ctx.lockPath,
    { locks: fileLocks, clock: signalling.clock, retryMs: 5, waitDeadlineMs: 5000 },
    task,
  );

  await signalling.firstSleep;

  const hasRunWhileHeld = task.mock.calls.length > 0;

  await holder.kill();

  const result = await locked;

  expect(hasRunWhileHeld).toBeFalse();
  expect(result).toBe('built');
});

test('it fails, and runs nothing, when a live holder keeps the lock past the deadline', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  const task = makeResolvingStub(undefined);
  const clock = buildSteppingClock();

  const locked = withFileLock(
    ctx.lockPath,
    { locks: fileLocks, clock, retryMs: 5, waitDeadlineMs: 50 },
    task,
  );

  const outcome = await locked.then(
    () => null,
    (error: unknown) => error,
  );

  expect(outcome).toMatchObject({ message: `the lock ${ctx.lockPath} is still held after 50 ms` });
  expect(task).not.toHaveBeenCalled();
  expect(clock.sleep).toHaveBeenCalledTimes(10);
});

test('it frees the lock when the task fails', async () => {
  const ctx = await setupTest();

  const failure = new Error('the build failed');

  const failed = withFileLock(
    ctx.lockPath,
    { locks: fileLocks, clock: systemClock, retryMs: 5, waitDeadlineMs: 5000 },
    makeRejectingStub(failure),
  );

  const outcome = await failed.then(
    () => null,
    (error: unknown) => error,
  );

  const lockFile = await fileLocks.openLockFile(ctx.lockPath);

  onTestFinished(() => fileLocks.closeLockFile(lockFile));

  expect(outcome).toBe(failure);
  expect(fileLocks.tryLock(lockFile)).toBeTrue();
});
