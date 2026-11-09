import type { SyncEntry } from './parse-sync-entries.ts';
import type { SyncedEntry } from './plan-retired-file-removal.ts';

export interface SyncPullRequestBodyFacts {
  // The commit of zgeoff/tools the run syncs from.
  readonly commit: string;

  // The commit of zgeoff/skills the run copies from; empty for none.
  readonly skillsCommit: string;

  // Every entry the run takes, synced or not.
  readonly entries: readonly SyncEntry[];

  readonly synced: readonly SyncedEntry[];
}

export function renderSyncPullRequestBody(facts: Readonly<SyncPullRequestBodyFacts>): string {
  const lines = facts.synced.map((entry) => `- \`${entry.name}\`: ${entry.description}`);

  const readsSkills =
    facts.skillsCommit !== '' &&
    facts.entries.some((entry) => entry.files.some((file) => file.repo === 'zgeoff/skills'));

  const source = readsSkills
    ? `zgeoff/tools at ${facts.commit}, and the skill text from zgeoff/skills at ${facts.skillsCommit},`
    : `zgeoff/tools at ${facts.commit}`;

  return `Copied from ${source} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n${lines.join('\n')}`;
}
