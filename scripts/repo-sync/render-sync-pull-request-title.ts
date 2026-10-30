import type { SyncedEntry } from './plan-retired-file-removal.ts';
import { retiredFilesName } from './plan-retired-file-removal.ts';

export function renderSyncPullRequestTitle(synced: readonly SyncedEntry[]): string {
  const names = synced.map((entry) => renderEntryName(entry.name));
  const [first, second] = names;

  if (names.length === 1) {
    return `chore(sync): update ${first}`;
  }

  return names.length === 2
    ? `chore(sync): update ${first} and ${second}`
    : `chore(sync): update ${names.length} shared entries`;
}

const entryKinds = ['skill', 'workflow', 'hook'] as const;

function renderEntryName(name: string): string {
  if (name === retiredFilesName) {
    return 'the retired files';
  }

  const kind = entryKinds.find((candidate) => name.startsWith(`${candidate}-`));

  return kind === undefined ? `the ${name}` : `the ${name.slice(kind.length + 1)} ${kind}`;
}
