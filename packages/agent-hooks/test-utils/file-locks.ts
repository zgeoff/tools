import { FFIType, dlopen } from 'bun:ffi';
import type { FileHandle } from 'node:fs/promises';
import { open } from 'node:fs/promises';

export interface FileLocks {
  readonly openLockFile: (path: string) => Promise<FileHandle>;

  // Takes the lock without waiting, and returns whether it got it.
  readonly tryLock: (lockFile: FileHandle) => boolean;

  // Closing the file frees its lock.
  readonly closeLockFile: (lockFile: FileHandle) => Promise<void>;
}

// flock ties the lock to the open file, so the kernel frees it when the holder exits or dies, and
// a waiter never has to judge whether a lock is stale. Node has no flock, so libc gives it.
const libcPath = process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';

const libc = dlopen(libcPath, {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
});

const lockExclusive = 2;
const lockNonBlocking = 4;

export const fileLocks: FileLocks = {
  openLockFile: (path) => open(path, 'a'),
  tryLock: (lockFile) => libc.symbols.flock(lockFile.fd, lockExclusive | lockNonBlocking) === 0,
  closeLockFile: (lockFile) => lockFile.close(),
};
