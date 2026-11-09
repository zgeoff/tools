import type { SyncPullRequest } from './parse-sync-pull-requests.ts';

export interface SyncAlarmFacts {
  // The open pull requests of the sync branch.
  readonly pullRequests: readonly SyncPullRequest[];

  // The titles of the repo's open issues.
  readonly issueTitles: readonly string[];

  readonly now: Date;
}

export type SyncAlarm =
  | { readonly kind: 'quiet' }
  | { readonly kind: 'raise'; readonly title: string; readonly body: string };

const dayMs = 24 * 60 * 60 * 1000;

export function pickSyncAlarm(facts: Readonly<SyncAlarmFacts>): SyncAlarm {
  const stuck = facts.pullRequests.find(
    (pullRequest) =>
      pullRequest.red && facts.now.getTime() - Date.parse(pullRequest.createdAt) > dayMs,
  );

  if (stuck === undefined) {
    return { kind: 'quiet' };
  }

  const title = `repo-sync: pull request #${stuck.number} is red for more than a day`;

  if (facts.issueTitles.includes(title)) {
    return { kind: 'quiet' };
  }

  return {
    kind: 'raise',
    title,
    body: [
      `The repo-sync pull request ${stuck.url}, opened at ${stuck.createdAt}, has a failing check, so it does not merge and this repo stops taking the shared files from zgeoff/tools.`,
      '',
      'Read the failing check and fix its cause: in this repo when the synced files break a check here, or in zgeoff/tools when the shared files are wrong. A fix in zgeoff/tools reaches this pull request in the next sync run. Close this issue once the pull request merges.',
    ].join('\n'),
  };
}
