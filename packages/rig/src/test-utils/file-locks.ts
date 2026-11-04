import type { Pointer } from 'bun:ffi';
import { FFIType, dlopen, read } from 'bun:ffi';
import type { FileHandle } from 'node:fs/promises';
import { open } from 'node:fs/promises';

export interface FileLocks {
  readonly openLockFile: (path: string) => Promise<FileHandle>;

  // Takes the lock without waiting, and returns whether it got it. Any failure other than another
  // holder throws.
  readonly tryLock: (lockFile: FileHandle) => boolean;

  // Closing the file frees its lock.
  readonly closeLockFile: (lockFile: FileHandle) => Promise<void>;
}

const lockExclusive = 2;
const lockNonBlocking = 4;

// flock ties the lock to the open file, so the kernel frees it when the holder exits or dies, and
// a waiter never has to judge whether a lock is stale.
export const fileLocks: FileLocks = {
  openLockFile: (path) => open(path, 'a'),
  tryLock: (lockFile) => {
    const libc = readLibc();

    if (libc.flock(lockFile.fd, lockExclusive | lockNonBlocking) === 0) {
      return true;
    }

    const errno = libc.readErrno();

    if (errno === libc.wouldBlock) {
      return false;
    }

    throw new Error(
      `flock on descriptor ${String(lockFile.fd)} failed with errno ${String(errno)}`,
    );
  },
  closeLockFile: (lockFile) => lockFile.close(),
};

interface Libc {
  readonly flock: (descriptor: number, operation: number) => number;
  readonly readErrno: () => number;
  readonly wouldBlock: number;
}

const libcCache: { libc: Libc | null } = { libc: null };

// Node has no flock, so libc gives it through Bun's FFI, with errno to tell a held lock apart from
// a failure.
function readLibc(): Libc {
  libcCache.libc ??= loadLibc();

  return libcCache.libc;
}

function loadLibc(): Libc {
  if (process.platform === 'darwin') {
    const library = dlopen('libSystem.B.dylib', {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      __error: { args: [], returns: FFIType.ptr },
    });

    return {
      flock: library.symbols.flock,

      // oxlint-disable-next-line no-underscore-dangle -- libc's own symbol name
      readErrno: () => readPointedInt(library.symbols.__error()),
      wouldBlock: 35,
    };
  }

  const symbols = {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    __errno_location: { args: [], returns: FFIType.ptr },
  } as const;

  // A glibc host can also carry musl's loader, so the libc that loads decides, not the files.
  const library = openLinuxLibc(symbols);

  return {
    flock: library.symbols.flock,

    // oxlint-disable-next-line no-underscore-dangle -- libc's own symbol name
    readErrno: () => readPointedInt(library.symbols.__errno_location()),
    wouldBlock: 11,
  };
}

function readPointedInt(pointer: Pointer | bigint | null): number {
  if (typeof pointer !== 'number') {
    throw new TypeError('libc returned no errno location');
  }

  return read.i32(pointer, 0);
}

const muslArchitectures: Partial<Record<NodeJS.Architecture, string>> = {
  arm64: 'aarch64',
  x64: 'x86_64',
};

function openLinuxLibc<Symbols extends Parameters<typeof dlopen>[1]>(symbols: Symbols) {
  try {
    return dlopen('libc.so.6', symbols);
  } catch (error) {
    const muslArchitecture = muslArchitectures[process.arch];

    if (muslArchitecture === undefined) {
      throw error;
    }

    return dlopen(`libc.musl-${muslArchitecture}.so.1`, symbols);
  }
}
