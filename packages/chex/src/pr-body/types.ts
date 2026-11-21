// How a prose check's commit sits against the branch: not in the repo, not an ancestor of head, an
// ancestor that a later doc or skill change outdates, or current.
export type ShaState = 'unknown' | 'outside' | 'old' | 'current';

export interface BranchFacts {
  // The doc and skill files that the commits in base..head change.
  readonly docFiles: readonly string[];

  // The newest commit in base..head that changes a doc or skill file, with the files it changes.
  readonly newestDocChange:
    | { readonly commit: string; readonly files: readonly string[] }
    | undefined;

  // The state of each commit hash the body names on a Deslop or Cold read line.
  readonly shaStates: Readonly<Record<string, ShaState>>;
}
