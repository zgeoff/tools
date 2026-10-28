export interface AuditFixCommitFacts {
  // Whether `git add -A` staged any change from the audit.
  readonly hasStagedChange: boolean;

  // The title file's text, or empty when the audit wrote none.
  readonly titleText: string;

  // The review file's text, or empty when the audit wrote none.
  readonly reviewText: string;
}

export interface AuditFixCommitPlan {
  // The lines for the step log.
  readonly logLines: readonly string[];

  readonly exitCode: number;

  // A clean audit deletes the fix branch, which closes a stale pull request.
  readonly deletesBranch: boolean;

  // The pushed output a run that commits nothing writes, or null for none.
  readonly pushedOutput: 'false' | null;

  // The commit message, or null when the run commits nothing.
  readonly commitMessage: string | null;

  // An ignore must not ride an auto-merge armed for an earlier fix, so a fix that needs review
  // looks for the open pull request whose auto-merge it turns off.
  readonly readsOpenPullRequest: boolean;
}

export function planAuditFixCommit(facts: AuditFixCommitFacts): AuditFixCommitPlan {
  const stops = { deletesBranch: false, pushedOutput: null, commitMessage: null };

  if (!facts.hasStagedChange) {
    return {
      ...stops,
      logLines: ['bun audit passes with nothing to change; nothing to fix.\n'],
      exitCode: 0,
      deletesBranch: true,
      pushedOutput: 'false',
      readsOpenPullRequest: false,
    };
  }

  if (facts.titleText.trim() === '') {
    return {
      ...stops,
      logLines: ['::error::audit-fix changed files but wrote no pull-request title\n'],
      exitCode: 1,
      readsOpenPullRequest: false,
    };
  }

  return {
    logLines: [],
    exitCode: 0,
    deletesBranch: false,
    pushedOutput: null,
    commitMessage: facts.titleText.replace(/\n+$/u, ''),
    readsOpenPullRequest: facts.reviewText.trim() === 'true',
  };
}
