import type { SyncFileRow } from './build-copy-plan.ts';

// One file of a manifest entry, as sync/manifest.json lists it.
export interface SyncFile {
  readonly source: string;
  readonly target: string;
  readonly mode?: string;

  // The repos that do not take the file.
  readonly except?: readonly string[];
}

// Gives each file's row for the repo: a file whose except list names the repo is skipped, and the
// rest are copied. GitHub repo names ignore case, so the match does too.
export function selectSyncFiles(files: readonly SyncFile[], repo: string): SyncFileRow[] {
  const name = repo.toLowerCase();

  return files.map((file) => ({
    action: (file.except ?? []).some((except) => except.toLowerCase() === name) ? 'skip' : 'copy',
    source: file.source,
    target: file.target,
    mode: file.mode ?? '0644',
  }));
}
