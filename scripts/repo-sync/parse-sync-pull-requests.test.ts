import { expect, test } from 'bun:test';
import { parseSyncPullRequests } from './parse-sync-pull-requests.ts';

test.each([
  [
    'a failed check run',
    [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }],
    true,
  ],
  [
    'a timed-out check run',
    [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'TIMED_OUT' }],
    true,
  ],
  ['an errored commit status', [{ __typename: 'StatusContext', state: 'ERROR' }], true],
  [
    'passed and running checks',
    [
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' },
      { __typename: 'StatusContext', state: 'PENDING' },
    ],
    false,
  ],
  ['no checks', [], false],
])('it reads a pull request with %s', (_label, statusCheckRollup, red) => {
  const parsed = parseSyncPullRequests([
    {
      number: 7,
      url: 'https://github.com/example/app/pull/7',
      createdAt: '2026-03-11T08:00:00Z',
      statusCheckRollup,
    },
  ]);

  expect(parsed).toStrictEqual([
    {
      number: 7,
      url: 'https://github.com/example/app/pull/7',
      createdAt: '2026-03-11T08:00:00Z',
      red,
    },
  ]);
});

test.each([
  ['a value that is not a list', { number: 7 }],
  ['a pull request without its checks', [{ number: 7, url: 'u', createdAt: 'c' }]],
])('it returns null for %s', (_label, value) => {
  const parsed = parseSyncPullRequests(value);

  expect(parsed).toBeNull();
});
