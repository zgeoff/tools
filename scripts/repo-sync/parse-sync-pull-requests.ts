import { isRecord } from '../../packages/std/src/is-record.ts';

export interface SyncPullRequest {
  readonly number: number;
  readonly url: string;
  readonly createdAt: string;

  // Whether any check run or commit status on the head failed.
  readonly red: boolean;
}

// Reads the list that `gh pr list --json number,url,createdAt,statusCheckRollup` prints, or null
// when the value is not one.
export function parseSyncPullRequests(value: unknown): SyncPullRequest[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const pullRequests: SyncPullRequest[] = [];

  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item['number'] !== 'number' ||
      typeof item['url'] !== 'string' ||
      typeof item['createdAt'] !== 'string' ||
      !Array.isArray(item['statusCheckRollup'])
    ) {
      return null;
    }

    pullRequests.push({
      number: item['number'],
      url: item['url'],
      createdAt: item['createdAt'],
      red: item['statusCheckRollup'].some((check) => isRedCheck(check)),
    });
  }

  return pullRequests;
}

const redConclusions = new Set([
  'ACTION_REQUIRED',
  'CANCELLED',
  'FAILURE',
  'STARTUP_FAILURE',
  'TIMED_OUT',
]);

const redStates = new Set(['ERROR', 'FAILURE']);

// A check run reports a conclusion and a commit status reports a state.
function isRedCheck(check: unknown): boolean {
  if (!isRecord(check)) {
    return false;
  }

  const conclusion = check['conclusion'];
  const state = check['state'];

  return (
    (typeof conclusion === 'string' && redConclusions.has(conclusion)) ||
    (typeof state === 'string' && redStates.has(state))
  );
}
