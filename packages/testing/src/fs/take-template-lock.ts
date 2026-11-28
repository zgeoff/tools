import { existsSync, mkdirSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeFolder } from './remove-folder.ts';

export interface TemplateLock {
  readonly release: () => void;
}

export interface TemplateLockHooks {
  // Runs after a caller has found the lock free and before it makes its generation.
  readonly afterInspect?: () => void;
}

// The highest numbered generation folder is the lock, held while fresh and unreleased. A caller
// takes it by making the next generation. A pruner that holds the lock can move the lock folder
// away, and a caller that finds it gone returns null.
export function takeTemplateLock(
  lockPath: string,
  staleLockMs: number,
  hooks: TemplateLockHooks = {},
): TemplateLock | null {
  try {
    return takeLockGeneration(lockPath, staleLockMs, hooks);
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

function takeLockGeneration(
  lockPath: string,
  staleLockMs: number,
  hooks: TemplateLockHooks,
): TemplateLock | null {
  // Bun's recursive mkdir can throw EEXIST when another process makes the folder during the call,
  // so a plain mkdir runs, and a folder that is already there is fine.
  makeFolder(lockPath);

  const highest = readHighestGeneration(lockPath);

  if (highest !== null && readIsHeld(join(lockPath, String(highest)), staleLockMs)) {
    return null;
  }

  hooks.afterInspect?.();
  const generation = (highest ?? 0) + 1;
  const generationPath = join(lockPath, String(generation));

  if (!makeFolder(generationPath)) {
    return null;
  }

  // A contender that paused can make a generation that a later holder already cleared away. Only
  // the highest generation holds the lock, so such a contender backs off.
  if (readHighestGeneration(lockPath) !== generation) {
    removeFolder(generationPath);

    return null;
  }

  removeLowerGenerations(lockPath, generation);

  return holdLock(generationPath, staleLockMs);
}

function makeFolder(path: string): boolean {
  try {
    mkdirSync(path);

    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return false;
    }

    throw error;
  }
}

function readHighestGeneration(lockPath: string): number | null {
  const generations = readGenerations(lockPath);

  return generations.length === 0 ? null : Math.max(...generations);
}

function readGenerations(lockPath: string): number[] {
  return readdirSync(lockPath)
    .filter((name) => /^[1-9]\d*$/u.test(name))
    .map(Number);
}

const releasedMarker = 'released';

function readIsHeld(generationPath: string, staleLockMs: number): boolean {
  if (existsSync(join(generationPath, releasedMarker))) {
    return false;
  }

  try {
    return Date.now() - statSync(generationPath).mtimeMs <= staleLockMs;
  } catch {
    return false;
  }
}

function removeLowerGenerations(lockPath: string, generation: number): void {
  for (const lower of readGenerations(lockPath)) {
    if (lower < generation) {
      removeFolder(join(lockPath, String(lower)));
    }
  }
}

function holdLock(generationPath: string, staleLockMs: number): TemplateLock {
  const refresh = setInterval(() => {
    try {
      const now = new Date();

      utimesSync(generationPath, now, now);
    } catch {
      // A newer holder cleared this generation away, and the build no longer holds the lock.
    }
  }, staleLockMs / 4);

  refresh.unref();

  return {
    release: () => {
      clearInterval(refresh);

      try {
        writeFileSync(join(generationPath, releasedMarker), '');
      } catch {
        // A newer holder cleared this generation away, and its lock is not this build's to release.
      }
    },
  };
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
