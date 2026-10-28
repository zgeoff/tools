export interface AuditFixPushFacts {
  // The number of the fix branch's open pull request, or null when it has none or the run did not
  // look.
  readonly openNumber: number | null;

  // Whether the remote fix branch already holds the commit's tree.
  readonly isSameTree: boolean;
}

export interface AuditFixPushPlan {
  // Auto-merge goes off before the push, so the push cannot merge an ignore unreviewed.
  readonly disablesAutoMerge: boolean;

  // A rerun on an unchanged base makes the same tree; pushing it again would only restart the
  // pull request's checks.
  readonly pushes: boolean;

  // The lines for the step log.
  readonly logLines: readonly string[];
}

export function planAuditFixPush(facts: AuditFixPushFacts): AuditFixPushPlan {
  return {
    disablesAutoMerge: facts.openNumber !== null,
    pushes: !facts.isSameTree,
    logLines: facts.isSameTree ? ['The open fix already holds this change.\n'] : [],
  };
}
