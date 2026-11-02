export interface SyncDispatchFacts {
  // The event that started the run, which is the completed Main run.
  readonly event: string;

  // The commit the completed Main run checked.
  readonly runCommit: string;

  // The commits of the green Main push runs on main, newest first.
  readonly greenCommits: readonly string[];
}

export type SyncDispatchRange =
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'range'; readonly commit: string; readonly previous: string | null };

// A newer push cancels the checks of an older one, so a commit can land with no green run of its
// own. Each run checks from the green commit before its own up to the newest one, so the runs of
// two green commits cover every commit between them in whatever order they finish.
export function pickSyncDispatchRange(facts: Readonly<SyncDispatchFacts>): SyncDispatchRange {
  const [newest] = facts.greenCommits;

  if (facts.event !== 'workflow_run') {
    return { kind: 'skip', reason: `the ${facts.event} event starts no sync` };
  }

  const position = facts.greenCommits.indexOf(facts.runCommit);

  if (position === -1 || newest === undefined) {
    return { kind: 'range', commit: facts.runCommit, previous: newest ?? null };
  }

  return { kind: 'range', commit: newest, previous: facts.greenCommits[position + 1] ?? null };
}
