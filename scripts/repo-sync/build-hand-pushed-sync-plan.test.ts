import { expect, test } from 'bun:test';
import { buildHandPushedSyncPlan } from './build-hand-pushed-sync-plan.ts';

test('it turns auto-merge off for a pull request someone other than its author pushed to', () => {
  const plan = buildHandPushedSyncPlan({
    branch: 'repo-sync/zgeoff-tools',
    pusher: 'octo-dev',
    pullRequests: [{ number: 7, author: 'sync-app[bot]', isAutoMergeOn: true }],
  });

  expect(plan).toStrictEqual({
    turnOff: [7],
    messages: [
      '::warning::octo-dev pushed to repo-sync/zgeoff-tools, so auto-merge of pull request #7 is off and it waits for review.\n',
    ],
  });
});

test('it keeps auto-merge on when the author pushes', () => {
  const plan = buildHandPushedSyncPlan({
    branch: 'repo-sync/zgeoff-tools',
    pusher: 'sync-app[bot]',
    pullRequests: [{ number: 7, author: 'sync-app[bot]', isAutoMergeOn: true }],
  });

  expect(plan).toStrictEqual({
    turnOff: [],
    messages: ['sync-app[bot] opened pull request #7; nothing to hold.\n'],
  });
});

test('it turns nothing off for a pull request with auto-merge off', () => {
  const plan = buildHandPushedSyncPlan({
    branch: 'repo-sync/zgeoff-tools',
    pusher: 'octo-dev',
    pullRequests: [{ number: 7, author: 'sync-app[bot]', isAutoMergeOn: false }],
  });

  expect(plan).toStrictEqual({
    turnOff: [],
    messages: [
      'octo-dev pushed to repo-sync/zgeoff-tools, and pull request #7 has auto-merge off.\n',
    ],
  });
});

test('it holds nothing when the branch has no open pull request', () => {
  const plan = buildHandPushedSyncPlan({
    branch: 'repo-sync/zgeoff-tools',
    pusher: 'octo-dev',
    pullRequests: [],
  });

  expect(plan).toStrictEqual({
    turnOff: [],
    messages: ['repo-sync/zgeoff-tools has no open pull request; nothing to hold.\n'],
  });
});
