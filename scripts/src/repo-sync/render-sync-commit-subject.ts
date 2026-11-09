import type { SyncEntry } from './parse-sync-entries.ts';

// Names each repo the entry's files come from, in the order the files first name them.
export function renderSyncCommitSubject(entry: SyncEntry): string {
  const repos = [...new Set(entry.files.map((file) => file.repo))];

  return `chore: sync ${entry.name} from ${repos.join(' and ')}`;
}
