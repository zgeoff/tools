import { expect, test } from 'bun:test';
import { pickSyncDispatchRange } from './pick-sync-dispatch-range.ts';

test('it ranges from the last green commit before the run', () => {
  const range = pickSyncDispatchRange({
    event: 'workflow_run',
    runCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    greenCommits: [
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '9999999999999999999999999999999999999999',
    ],
  });

  expect(range).toStrictEqual({
    kind: 'range',
    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    previous: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
});

test('it ranges from the newest green commit when the run is not listed yet', () => {
  const range = pickSyncDispatchRange({
    event: 'workflow_run',
    runCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    greenCommits: [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '9999999999999999999999999999999999999999',
    ],
  });

  expect(range).toStrictEqual({
    kind: 'range',
    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    previous: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
});

test('it ranges from no commit when main has no other green commit', () => {
  const range = pickSyncDispatchRange({
    event: 'workflow_run',
    runCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    greenCommits: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
  });

  expect(range).toStrictEqual({
    kind: 'range',
    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    previous: null,
  });
});

test('it ranges from the green commit before the run up to the newest green commit', () => {
  const range = pickSyncDispatchRange({
    event: 'workflow_run',
    runCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    greenCommits: [
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '9999999999999999999999999999999999999999',
    ],
  });

  expect(range).toStrictEqual({
    kind: 'range',
    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    previous: '9999999999999999999999999999999999999999',
  });
});

test('it skips an event that starts no sync', () => {
  const range = pickSyncDispatchRange({
    event: 'workflow_dispatch',
    runCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    greenCommits: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
  });

  expect(range).toStrictEqual({
    kind: 'skip',
    reason: 'the workflow_dispatch event starts no sync',
  });
});
