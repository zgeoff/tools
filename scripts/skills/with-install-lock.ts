import { link, readFile, rename, rm, writeFile } from 'node:fs/promises';

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
// names its owner, so it never exists without one. A lock whose owner no longer runs is taken over.
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

      await removeDeadLock(options);

      await options.wait();
    }
  } finally {
    await rm(claim, { force: true });
  }

  throw new Error(
    `${options.lockPath} is held by another install; remove it if no install runs, then try again`,
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

// The lock moves aside before it goes, so of two waiters that find the same dead owner only one
// takes the lock away. A waiter that moved a lock another waiter had just made puts it back.
async function removeDeadLock(options: Readonly<InstallLockOptions>): Promise<void> {
  const owner = await readLockOwner(options.lockPath);

  if (owner === null || options.probeOwner(owner)) {
    return;
  }

  const aside = `${options.lockPath}.${options.ownerID}.dead`;

  try {
    await rename(options.lockPath, aside);
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) {
      return;
    }

    throw error;
  }

  const movedOwner = await readLockOwner(aside);

  if (movedOwner !== owner) {
    await createLock(aside, options.lockPath);
  }

  await rm(aside, { force: true });
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
