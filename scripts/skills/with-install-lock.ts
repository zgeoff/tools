// The file operations the lock runs; flockLockFile holds the real ones.
export interface LockFile {
  // Opens the lock file, which it creates when missing, and returns its descriptor.
  readonly createDescriptor: (path: string) => Promise<number>;

  // Takes the lock through the descriptor at once; false when another descriptor holds it.
  readonly createLock: (descriptor: number) => boolean;

  // Closes the descriptor, which ends any lock it holds.
  readonly removeDescriptor: (descriptor: number) => Promise<void>;
}

export interface InstallLockOptions {
  readonly lockPath: string;
  readonly lockFile: LockFile;

  // Waits between two tries for the lock.
  readonly wait: () => Promise<void>;

  readonly attempts: number;
}

// Runs the work while this run holds the lock. The lock ends with the descriptor that holds it, and
// so with the process, so a stopped install leaves no lock for a later one to clear.
export async function withInstallLock<T>(
  options: Readonly<InstallLockOptions>,
  work: () => Promise<T>,
): Promise<T> {
  const descriptor = await options.lockFile.createDescriptor(options.lockPath);

  try {
    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
      const isHeld = options.lockFile.createLock(descriptor);

      if (isHeld) {
        return await work();
      }

      await options.wait();
    }
  } finally {
    await options.lockFile.removeDescriptor(descriptor);
  }

  throw new Error(`${options.lockPath} is held by another install; try again once it ends`);
}
