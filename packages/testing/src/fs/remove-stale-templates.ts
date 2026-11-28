import { readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { collectTemplateGroups } from './collect-template-groups.ts';
import type { TemplateGroup } from './collect-template-groups.ts';
import { removeFolder } from './remove-folder.ts';
import { takeTemplateLock } from './take-template-lock.ts';

export interface StaleTemplateOptions {
  readonly nowMs: number;

  // A template that nothing has used for longer than this is stale.
  readonly maxUnusedMs: number;

  readonly staleLockMs: number;

  // Leaves out each template this rejects. Every template is a candidate when it is unset.
  readonly shouldPrune?: (folder: string) => boolean;

  // Runs after a pruner has moved a template aside and before it checks the marker again.
  readonly afterSetAside?: () => void;
}

// Removes each stale template with its marker, lock and leftovers, under the template's lock. A
// reader marks before it checks, so the pruner moves the template aside, checks the marker again,
// and puts the template back when a reader marked it meanwhile.
export function removeStaleTemplates(templatesRoot: string, options: StaleTemplateOptions): void {
  const entries = readEntries(templatesRoot);

  for (const group of collectTemplateGroups(entries)) {
    if (!(options.shouldPrune?.(group.folder) ?? true)) {
      continue;
    }

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

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
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
  const marker = `${template}.used`;
  const lockPath = `${template}.lock`;
  const lock = takeTemplateLock(lockPath, options.staleLockMs);

  if (lock === null) {
    return;
  }

  let removedLock = false;

  try {
    // Taking the lock refreshed the lock folder, so only the other entries count from here on, and
    // a group with nothing else left is a lone lock folder.
    const lastUsedMs = readLastUsedMs(templatesRoot, group, []);

    if (lastUsedMs !== null && !isStale(lastUsedMs, options)) {
      return;
    }

    const setAside = buildSetAsidePath(template);
    const movedTemplate = moveFolder(template, setAside);

    options.afterSetAside?.();
    const markedMs = readModifiedMs(marker);

    if (movedTemplate && markedMs !== null && !isStale(markedMs, options)) {
      renameSync(setAside, template);

      return;
    }

    removeFolder(marker);
    removeFolder(setAside);

    for (const leftover of group.leftovers) {
      removeFolder(join(templatesRoot, leftover));
    }

    const lockAside = buildSetAsidePath(template);

    removedLock = moveFolder(lockPath, lockAside);

    removeFolder(lockAside);
  } finally {
    if (!removedLock) {
      lock.release();
    }
  }
}

function buildSetAsidePath(template: string): string {
  return `${template}.removing-${process.pid}-${crypto.randomUUID()}`;
}

function moveFolder(from: string, to: string): boolean {
  try {
    renameSync(from, to);

    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}
