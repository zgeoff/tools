export interface MockCheck {
  name: string;
  status: string;
  conclusion: string | null;
  app?: string;
}

export interface MockStatus {
  context: string;
  state: string;
}

// GitHub returns a null status rollup until the first check registers.
export function buildMockHeadResponse(
  oid: string,
  checks: readonly MockCheck[],
  statuses: readonly MockStatus[] = [],
) {
  const nodes = [
    ...checks.map((check) => ({
      __typename: 'CheckRun',
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
      checkSuite: { app: { slug: check.app ?? 'github-actions' } },
    })),
    ...statuses.map((status) => ({ __typename: 'StatusContext', ...status })),
  ];

  const statusCheckRollup = nodes.length === 0 ? null : { contexts: { nodes } };

  return { data: { repository: { ref: { target: { oid, statusCheckRollup } } } } };
}
