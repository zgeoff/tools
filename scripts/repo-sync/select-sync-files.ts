import type { SyncFileRow } from './build-copy-plan.ts';
import type { SyncSourceRepo } from './sync-source-checkouts.ts';
import { syncSourceCheckouts } from './sync-source-checkouts.ts';

// One file of a manifest entry, as sync/manifest.json lists it.
export interface SyncFile {
  // The repo that holds the source, at the path the source names.
  readonly repo: SyncSourceRepo;

  readonly source: string;
  readonly target: string;
  readonly mode?: string;

  // The repos that do not take the file.
  readonly except?: readonly string[];
}

// Gives each file's row for the repo: a file whose except list names the repo is skipped, and the
// rest are copied. A row's source is its path in the caller's checkout, under the checkout of the
// file's repo. GitHub repo names ignore case, so the match does too.
export function selectSyncFiles(files: readonly SyncFile[], repo: string): SyncFileRow[] {
  const name = repo.toLowerCase();

  return files.map((file) => ({
    action: (file.except ?? []).some((except) => except.toLowerCase() === name) ? 'skip' : 'copy',
    source: `${syncSourceCheckouts[file.repo]}/${file.source}`,
    target: file.target,
    mode: file.mode ?? '0644',
  }));
}
