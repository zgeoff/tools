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

test('it always dispatches the newest green commit for a dispatch from another repo', () => {
  const range = pickSyncDispatchRange({
    event: 'repository_dispatch',
    runCommit: '',
    greenCommits: [
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ],
  });

  expect(range).toStrictEqual({
    kind: 'always',
    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
});

test('it skips a dispatch from another repo when main has no green commit', () => {
  const range = pickSyncDispatchRange({
    event: 'repository_dispatch',
    runCommit: '',
    greenCommits: [],
  });

  expect(range).toStrictEqual({ kind: 'skip', reason: 'main of zgeoff/tools has no green commit' });
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
