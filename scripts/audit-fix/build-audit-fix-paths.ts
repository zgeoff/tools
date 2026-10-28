import { join } from 'node:path';

export interface AuditFixPaths {
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  readonly review: string;
  readonly pendingIgnores: string;
  readonly pullRequestBody: string;
}

// The default branch's fix lives on audit-fix, and another base gets its own branch, so a test run
// against another base never touches the real one.
export function buildAuditFixPaths(
  runnerTemp: string,
  base: string,
  defaultBranch: string,
): AuditFixPaths {
  return {
    branch: base === defaultBranch ? 'audit-fix' : `audit-fix-${base.replaceAll('/', '-')}`,
    title: join(runnerTemp, 'title.txt'),
    body: join(runnerTemp, 'body.md'),
    review: join(runnerTemp, 'needs-review.txt'),
    pendingIgnores: join(runnerTemp, 'pending-ignores.json'),
    pullRequestBody: join(runnerTemp, 'pr-body.md'),
  };
}
