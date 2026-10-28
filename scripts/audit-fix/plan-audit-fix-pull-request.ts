export interface AuditFixPullRequestFacts {
  readonly needsReview: boolean;

  // The number of the fix branch's open pull request, or null when it has none.
  readonly openNumber: number | null;

  readonly isAutomerge: boolean;
}

export type PullRequestWrite =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly number: number; readonly removesIgnoreLabel: boolean };

export interface AuditFixPullRequestPlan {
  readonly labels: readonly string[];
  readonly write: PullRequestWrite;

  // The merge waits for a person when the change adds or renews an ignore.
  readonly waitsForReview: boolean;

  readonly turnsAutoMergeOn: boolean;
}

export function planAuditFixPullRequest(facts: AuditFixPullRequestFacts): AuditFixPullRequestPlan {
  const write: PullRequestWrite =
    facts.openNumber === null
      ? { kind: 'create' }
      : { kind: 'edit', number: facts.openNumber, removesIgnoreLabel: !facts.needsReview };

  return {
    labels: ['dependencies', 'security', ...(facts.needsReview ? ['audit-ignore'] : [])],
    write,
    waitsForReview: facts.needsReview,
    turnsAutoMergeOn: !facts.needsReview && facts.isAutomerge,
  };
}
