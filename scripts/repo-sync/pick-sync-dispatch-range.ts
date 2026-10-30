export interface SyncDispatchFacts {
  // The event that started the run: the completed Main run, or a dispatch from another repo.
  readonly event: string;

  // The commit the completed Main run checked; empty for a dispatch from another repo.
  readonly runCommit: string;

  // The commits of the green Main push runs on main, newest first.
  readonly greenCommits: readonly string[];
}

export type SyncDispatchRange =
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'always'; readonly commit: string }
  | { readonly kind: 'range'; readonly commit: string; readonly previous: string | null };

// A newer push cancels the checks of an older one, so a commit can land with no green run of its
// own. The range from the last green commit before the run covers every commit in between.
export function pickSyncDispatchRange(facts: Readonly<SyncDispatchFacts>): SyncDispatchRange {
  const [newest] = facts.greenCommits;

  if (facts.event === 'repository_dispatch') {
    return newest === undefined
      ? { kind: 'skip', reason: 'main of zgeoff/tools has no green commit' }
      : { kind: 'always', commit: newest };
  }

  if (facts.event !== 'workflow_run') {
    return { kind: 'skip', reason: `the ${facts.event} event starts no sync` };
  }

  const position = facts.greenCommits.indexOf(facts.runCommit);

  if (position > 0) {
    return {
      kind: 'skip',
      reason: `${newest} is a newer green commit than ${facts.runCommit}, and its run dispatches`,
    };
  }

  const previous = facts.greenCommits.find((commit) => commit !== facts.runCommit) ?? null;

  return { kind: 'range', commit: facts.runCommit, previous };
}
