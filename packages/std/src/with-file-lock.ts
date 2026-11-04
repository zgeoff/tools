import type { Pointer } from 'bun:ffi';
import { FFIType, dlopen, read } from 'bun:ffi';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { isRecord } from './is-record.ts';

export interface FileLockOwner {
  readonly pid: number;
  readonly host: string;

  // Tells apart two holders that had the same pid, since the kernel reuses a pid.
  readonly token: string;

  readonly acquiredAt: string;
}

export type FileLockResult<Value> =
  | { readonly kind: 'ran'; readonly value: Value }
  | { readonly kind: 'busy'; readonly holder: FileLockOwner | null };

export interface FileLockOptions {
  // How long to wait for another holder to let go before the result is busy. 0 tries once.
  readonly waitMs?: number;
}

// The kernel drops a flock when its holder's descriptor closes, a crash included, so a dead
// holder's lock needs no takeover. The file stays, since a waiter that opened it before a removal
// would lock the removed file while a new caller locks its replacement.
export async function withFileLock<Value>(
  path: string,
  fn: () => Promise<Value>,
  options: FileLockOptions = {},
): Promise<FileLockResult<Value>> {
  const descriptor = openSync(path, 'a');

  try {
    const isLocked = await waitForLock(descriptor, path, options.waitMs ?? 0);

    if (!isLocked) {
      return { kind: 'busy', holder: readFileLockOwner(path) };
    }

    writeOwner(descriptor);

    try {
      return { kind: 'ran', value: await fn() };
    } finally {
      ftruncateSync(descriptor, 0);
    }
  } finally {
    closeSync(descriptor);
  }
}

const retryMs = 25;

async function waitForLock(descriptor: number, path: string, waitMs: number): Promise<boolean> {
  const deadlineMs = Date.now() + waitMs;

  for (;;) {
    if (tryLock(descriptor, path)) {
      return true;
    }

    if (Date.now() >= deadlineMs) {
      return false;
    }

    const remainingMs = Math.max(deadlineMs - Date.now(), 0);

    await Bun.sleep(Math.min(retryMs, remainingMs));
  }
}

const lockExclusive = 2;
const lockNonBlocking = 4;

function tryLock(descriptor: number, path: string): boolean {
  const libc = readLibc();

  if (libc.flock(descriptor, lockExclusive | lockNonBlocking) === 0) {
    return true;
  }

  const errno = libc.readErrno();

  if (errno === libc.wouldBlock) {
    return false;
  }

  throw new Error(`flock on ${path} failed with errno ${String(errno)}`);
}

interface Libc {
  readonly flock: (descriptor: number, operation: number) => number;
  readonly readErrno: () => number;
  readonly wouldBlock: number;
}

const libcCache: { libc: Libc | null } = { libc: null };

// Node and Bun have no flock binding, so the lock calls libc's flock through Bun's FFI.
function readLibc(): Libc {
  libcCache.libc ??= loadLibc();

  return libcCache.libc;
}

function loadLibc(): Libc {
  if (process.platform === 'darwin') {
    const library = dlopen('libc.dylib', {
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

  const library = dlopen(resolveLinuxLibc(), {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    __errno_location: { args: [], returns: FFIType.ptr },
  });

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

function resolveLinuxLibc(): string {
  const muslArchitecture = muslArchitectures[process.arch];

  if (muslArchitecture !== undefined && existsSync(`/lib/ld-musl-${muslArchitecture}.so.1`)) {
    return `libc.musl-${muslArchitecture}.so.1`;
  }

  return 'libc.so.6';
}

// A holder can be between its flock and its write, so an empty or partial record reads as null.
function readFileLockOwner(path: string): FileLockOwner | null {
  try {
    return parseFileLockOwner(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function parseFileLockOwner(text: string): FileLockOwner | null {
  const value: unknown = JSON.parse(text);

  if (
    isRecord(value) &&
    typeof value['pid'] === 'number' &&
    typeof value['host'] === 'string' &&
    typeof value['token'] === 'string' &&
    typeof value['acquiredAt'] === 'string'
  ) {
    return {
      pid: value['pid'],
      host: value['host'],
      token: value['token'],
      acquiredAt: value['acquiredAt'],
    };
  }

  return null;
}

// The record goes in only after the flock is held, so a caller that finds the lock busy never
// truncates the holder's record.
function writeOwner(descriptor: number): void {
  const owner: FileLockOwner = {
    pid: process.pid,
    host: hostname(),
    token: randomUUID(),
    acquiredAt: new Date().toISOString(),
  };

  ftruncateSync(descriptor, 0);
  writeSync(descriptor, JSON.stringify(owner));
}
