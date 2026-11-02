import type { FileHandle } from 'node:fs/promises';
import { match } from 'ts-pattern';
import type { FileLocks } from './file-locks.ts';
import { pickLockStep } from './pick-lock-step.ts';
import type { Clock } from './system-clock.ts';

export interface FileLockOptions {
  readonly locks: FileLocks;

  readonly clock: Clock;

  readonly retryMs: number;

  readonly waitDeadlineMs: number;
}

// The lock file stays in place after the task, because a waiter that opened it before a removal
// would lock a file that the next caller no longer sees.
export async function withFileLock<Result>(
  lockPath: string,
  options: FileLockOptions,
  task: () => Promise<Result>,
): Promise<Result> {
  const lockFile = await options.locks.openLockFile(lockPath);

  try {
    await waitForLock(lockPath, lockFile, options);

    return await task();
  } finally {
    await options.locks.closeLockFile(lockFile);
  }
}

async function waitForLock(
  lockPath: string,
  lockFile: FileHandle,
  options: FileLockOptions,
): Promise<void> {
  const deadlineMs = options.clock.now() + options.waitDeadlineMs;

  for (;;) {
    const step = pickLockStep({
      isLocked: options.locks.tryLock(lockFile),
      nowMs: options.clock.now(),
      deadlineMs,
    });

    const isAcquired = await match(step)
      .with('acquired', () => true)
      .with('give-up', () => {
        throw new Error(`the lock ${lockPath} is still held after ${options.waitDeadlineMs} ms`);
      })
      .with('wait', async () => {
        await options.clock.sleep(options.retryMs);

        return false;
      })
      .exhaustive();

    if (isAcquired) {
      return;
    }
  }
}
