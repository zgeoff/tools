import type { SyncedEntry } from './plan-retired-file-removal.ts';
import { retiredFilesName } from './plan-retired-file-removal.ts';
import { toolsPinsEntry } from './tools-pins-entry.ts';

// commitlint's header-max-length rule allows 72 characters, and a squash merge
// makes the title the commit subject.
const maxTitleLength = 72;

export function renderSyncPullRequestTitle(synced: readonly SyncedEntry[]): string {
  const names = synced.map((entry) => renderEntryName(entry.name));
  const [first, second] = names;

  if (names.length === 1) {
    return `chore(sync): update ${first}`;
  }

  const pairTitle = `chore(sync): update ${first} and ${second}`;

  return names.length === 2 && pairTitle.length <= maxTitleLength
    ? pairTitle
    : `chore(sync): update ${names.length} shared entries`;
}

const entryKinds = ['skill', 'workflow', 'hook'] as const;

function renderEntryName(name: string): string {
  if (name === retiredFilesName) {
    return 'the retired files';
  }

  if (name === toolsPinsEntry.name) {
    return 'the zgeoff/tools pins';
  }

  const kind = entryKinds.find((candidate) => name.startsWith(`${candidate}-`));

  return kind === undefined ? `the ${name}` : `the ${name.slice(kind.length + 1)} ${kind}`;
}
