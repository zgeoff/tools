import { link, readFile, rm, writeFile } from 'node:fs/promises';

export interface InstallLockOptions {
  // The lock file; its folder must exist.
  readonly lockPath: string;

  // Names this process in the lock, as its process ID does.
  readonly ownerID: string;

  // Answers whether the owner a lock names still runs.
  readonly probeOwner: (ownerID: string) => boolean;

  // Waits between two tries for the lock.
  readonly wait: () => Promise<void>;

  readonly attempts: number;
}

// Runs the work while this process holds the lock. The lock file is a hard link to a file that
// names its owner, so it never exists without one. A lock whose owner no longer runs is removed.
export async function withInstallLock<T>(
  options: Readonly<InstallLockOptions>,
  work: () => Promise<T>,
): Promise<T> {
  const claim = `${options.lockPath}.${options.ownerID}`;

  await writeFile(claim, options.ownerID);

  try {
    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
      const isHeld = await createLock(claim, options.lockPath);

      if (isHeld) {
        try {
          return await work();
        } finally {
          await rm(options.lockPath, { force: true });
        }
      }

      await removeDeadLock(options, claim);

      await options.wait();
    }
  } finally {
    await rm(claim, { force: true });
  }

  throw new Error(
    `${options.lockPath} is held by another install; if no install runs, remove it and ${options.lockPath}.recovery, then try again`,
  );
}

// Returns false when another process holds the lock.
async function createLock(claim: string, lockPath: string): Promise<boolean> {
  try {
    await link(claim, lockPath);

    return true;
  } catch (error) {
    if (isErrorCode(error, 'EEXIST')) {
      return false;
    }

    throw error;
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

// Only a waiter that holds the recovery lock removes a dead lock, and it reads the owner again under
// that lock. No other process can free the lock path while a dead owner holds it, so the lock it
// removes is always a dead one. A waiter that finds the recovery lock held lets its holder recover.
async function removeDeadLock(options: Readonly<InstallLockOptions>, claim: string): Promise<void> {
  const owner = await readLockOwner(options.lockPath);

  if (owner === null || options.probeOwner(owner)) {
    return;
  }

  const recoveryPath = `${options.lockPath}.recovery`;

  const isRecovering = await createLock(claim, recoveryPath);

  if (!isRecovering) {
    return;
  }

  try {
    const current = await readLockOwner(options.lockPath);

    if (current !== null && !options.probeOwner(current)) {
      await rm(options.lockPath, { force: true });
    }
  } finally {
    await rm(recoveryPath, { force: true });
  }
}

// Returns null when no lock exists.
async function readLockOwner(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) {
      return null;
    }

    throw error;
  }
}
