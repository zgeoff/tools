export interface AuditFixPullRequestFacts {
  readonly needsReview: boolean;

  // The number of the fix branch's open pull request, or null when it has none.
  readonly openNumber: number | null;

  readonly isAutomerge: boolean;

  readonly base: string;

  readonly branch: string;

  readonly title: string;

  readonly bodyFile: string;
}

// One gh call. A call that may fail, such as a label the repo already has, does not stop the run.
export interface GHCommand {
  readonly args: readonly string[];

  readonly mustSucceed: boolean;
}

export interface AuditFixPullRequestPlan {
  readonly commands: readonly GHCommand[];

  // The merge waits for a person when the change adds or renews an ignore.
  readonly waitsForReview: boolean;

  readonly turnsAutoMergeOn: boolean;
}

// Plans the gh calls that open or update the fix's pull request, so the runner only runs them.
export function planAuditFixPullRequest(facts: AuditFixPullRequestFacts): AuditFixPullRequestPlan {
  const labels = ['dependencies', 'security', ...(facts.needsReview ? ['audit-ignore'] : [])];

  // A label the repo already has keeps its colour and description, so a refused create is fine.
  const labelCommands = labels.map((label) => ({
    args: ['label', 'create', label],
    mustSucceed: false,
  }));

  const textArgs = ['--title', facts.title, '--body-file', facts.bodyFile];

  const writeCommands: GHCommand[] =
    facts.openNumber === null
      ? [
          {
            args: [
              'pr',
              'create',
              '--base',
              facts.base,
              '--head',
              facts.branch,
              ...textArgs,
              '--label',
              labels.join(','),
            ],
            mustSucceed: true,
          },
        ]
      : buildEditCommands(facts, String(facts.openNumber), textArgs, labels);

  return {
    commands: [...labelCommands, ...writeCommands],
    waitsForReview: facts.needsReview,
    turnsAutoMergeOn: !facts.needsReview && facts.isAutomerge,
  };
}

// An edit drops the audit-ignore label of an earlier run once the fix needs no review.
function buildEditCommands(
  facts: AuditFixPullRequestFacts,
  number: string,
  textArgs: readonly string[],
  labels: readonly string[],
): GHCommand[] {
  const edit = {
    args: ['pr', 'edit', number, ...textArgs, '--add-label', labels.join(',')],
    mustSucceed: true,
  };

  const removeIgnoreLabel = {
    args: ['pr', 'edit', number, '--remove-label', 'audit-ignore'],
    mustSucceed: false,
  };

  return facts.needsReview ? [edit] : [edit, removeIgnoreLabel];
}
