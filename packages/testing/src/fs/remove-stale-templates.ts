import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { collectTemplateGroups } from './collect-template-groups.ts';
import type { TemplateGroup } from './collect-template-groups.ts';
import { removeFolder } from './remove-folder.ts';
import { takeTemplateLock } from './take-template-lock.ts';

export interface StaleTemplateOptions {
  readonly nowMs: number;

  // A template that nothing has used for longer than this is stale.
  readonly maxUnusedMs: number;

  // A lock untouched for longer than this belongs to a dead caller.
  readonly staleLockMs: number;

  // Runs once a prune holds a template's lock, before it deletes anything.
  readonly beforeDelete?: () => void;
}

// Removes each stale template and its leftovers under its lock, which a reader takes to mark the
// template, and skips a template whose lock is held. A lock folder with nothing else left goes in
// a later prune, once the lock has gone unused for the limit.
export function removeStaleTemplates(templatesRoot: string, options: StaleTemplateOptions): void {
  const entries = readEntries(templatesRoot);

  for (const group of collectTemplateGroups(entries)) {
    const lockPaths = readLockPaths(join(templatesRoot, `${group.folder}.lock`));

    if (isStale(readLastUsedMs(templatesRoot, group, lockPaths), options)) {
      removeGroup(templatesRoot, group, options);
    }
  }
}

function readEntries(folder: string): string[] {
  try {
    return readdirSync(folder);
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
}

// A cache folder that is a file, or not there, holds no templates.
function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

function readLockPaths(lockPath: string): string[] {
  return [lockPath, ...readEntries(lockPath).map((generation) => join(lockPath, generation))];
}

function isStale(lastUsedMs: number | null, options: StaleTemplateOptions): boolean {
  return lastUsedMs !== null && options.nowMs - lastUsedMs > options.maxUnusedMs;
}

// A template's marker holds its last use. Without one, the newest of its other entries does.
function readLastUsedMs(
  templatesRoot: string,
  group: TemplateGroup,
  lockPaths: readonly string[],
): number | null {
  return (
    readModifiedMs(join(templatesRoot, `${group.folder}.used`)) ??
    readNewestMs([
      join(templatesRoot, group.folder),
      ...group.leftovers.map((leftover) => join(templatesRoot, leftover)),
      ...lockPaths,
    ])
  );
}

function readModifiedMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

function readNewestMs(paths: readonly string[]): number | null {
  const modifiedMs = paths.map((path) => readModifiedMs(path)).filter((value) => value !== null);

  return modifiedMs.length === 0 ? null : Math.max(...modifiedMs);
}

function removeGroup(
  templatesRoot: string,
  group: TemplateGroup,
  options: StaleTemplateOptions,
): void {
  const template = join(templatesRoot, group.folder);
  const lockPath = `${template}.lock`;
  const lock = takeTemplateLock(lockPath, options.staleLockMs);

  if (lock === null) {
    return;
  }

  // Taking the lock refreshed the lock folder, so only the other entries count from here on.
  const lastUsedMs = readLastUsedMs(templatesRoot, group, []);

  if (lastUsedMs !== null && !isStale(lastUsedMs, options)) {
    lock.release();

    return;
  }

  const isLockOnly = !existsSync(template) && !existsSync(`${template}.used`);

  try {
    options.beforeDelete?.();
    removeFolder(template);
    removeFolder(`${template}.used`);

    for (const leftover of group.leftovers) {
      removeFolder(join(templatesRoot, leftover));
    }
  } finally {
    // The lock stays held until the template is gone, and the release stops the refresh timer
    // before the lock folder goes.
    lock.release();
  }

  if (isLockOnly) {
    removeFolder(lockPath);
  }
}
