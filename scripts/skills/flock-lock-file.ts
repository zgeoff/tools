import { FFIType, dlopen } from 'bun:ffi';
import { closeSync, openSync } from 'node:fs';
import type { LockFile } from './with-install-lock.ts';

// Node has no flock, so it comes from libc. The kernel ends a flock lock when its last descriptor
// closes, which a stopped process does too.
const libcName = process.platform === 'darwin' ? 'libc.dylib' : 'libc.so.6';

const libc = dlopen(libcName, {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
});

// LOCK_EX (2) with LOCK_NB (4), the same values on Linux and macOS.
const exclusiveWithoutWaiting = 6;

export const flockLockFile: LockFile = {
  createDescriptor: (path) => Promise.resolve(openSync(path, 'a')),
  createLock: (descriptor) => libc.symbols.flock(descriptor, exclusiveWithoutWaiting) === 0,
  removeDescriptor: (descriptor) => {
    closeSync(descriptor);

    return Promise.resolve();
  },
};
