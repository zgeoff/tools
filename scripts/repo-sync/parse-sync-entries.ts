import { isRecord } from '../../packages/std/src/is-record.ts';
import type { SyncFile } from './select-sync-files.ts';

// One entry of sync/manifest.json. The prepare job reads the manifest into these, and the sync job
// reads the entries the prepare job picked through the same parse.
export interface SyncEntry {
  readonly name: string;
  readonly description: string;
  readonly files: readonly SyncFile[];

  // The shell command that runs after the copy; empty for none.
  readonly build: string;

  // A repo takes an opt-in entry only when its include input names it.
  readonly optIn: boolean;

  // Each package.json script the build writes, with the value it writes; empty for none.
  readonly scripts: Readonly<Record<string, string>>;
}

// Returns null when any entry breaks the contract, so a bad list fails the step before it syncs.
export function parseSyncEntries(value: unknown): SyncEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries = value.map((entry: unknown) => parseSyncEntry(entry));

  return entries.every((entry) => entry !== null) ? entries : null;
}

function parseSyncEntry(entry: unknown): SyncEntry | null {
  if (
    !isRecord(entry) ||
    typeof entry['name'] !== 'string' ||
    typeof entry['description'] !== 'string' ||
    !Array.isArray(entry['files'])
  ) {
    return null;
  }

  const build = entry['build'] ?? '';
  const optIn = entry['optIn'] ?? false;
  const scripts = entry['scripts'] ?? {};
  const files = entry['files'].map((file: unknown) => parseSyncFile(file));

  if (
    typeof build !== 'string' ||
    typeof optIn !== 'boolean' ||
    !isStringRecord(scripts) ||
    !files.every((file) => file !== null)
  ) {
    return null;
  }

  return {
    name: entry['name'],
    description: entry['description'],
    files,
    build,
    optIn,
    scripts,
  };
}

function parseSyncFile(file: unknown): SyncFile | null {
  if (!isRecord(file) || typeof file['source'] !== 'string' || typeof file['target'] !== 'string') {
    return null;
  }

  const mode = file['mode'];
  const except = file['except'];

  if (mode !== undefined && typeof mode !== 'string') {
    return null;
  }

  if (except !== undefined && !isStringList(except)) {
    return null;
  }

  return {
    source: file['source'],
    target: file['target'],
    ...(mode === undefined ? {} : { mode }),
    ...(except === undefined ? {} : { except }),
  };
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}
