import { expect, test } from 'bun:test';
import { pickSyncAlarm } from './pick-sync-alarm.ts';

test('it raises an issue for a red sync pull request older than a day', () => {
  const alarm = pickSyncAlarm({
    pullRequests: [
      {
        number: 41,
        url: 'https://github.com/example/app/pull/41',
        createdAt: '2026-03-11T11:59:00Z',
        red: true,
      },
    ],
    issueTitles: ['Unrelated bug'],
    now: new Date('2026-03-12T12:00:00Z'),
  });

  expect(alarm).toStrictEqual({
    kind: 'raise',
    title: 'repo-sync: pull request #41 is red for more than a day',
    body:
      'The repo-sync pull request https://github.com/example/app/pull/41, opened at 2026-03-11T11:59:00Z, has a failing check, so it does not merge and this repo stops taking the shared files from zgeoff/tools.\n\n' +
      'Read the failing check and fix its cause: in this repo when the synced files break a check here, or in zgeoff/tools when the shared files are wrong. A fix in zgeoff/tools reaches this pull request in the next sync run. Close this issue once the pull request merges.',
  });
});

test.each([
  ['a red pull request younger than a day', '2026-03-11T12:01:00Z', true],
  ['a pull request older than a day that is not red', '2026-03-01T00:00:00Z', false],
])('it stays quiet for %s', (_label, createdAt, red) => {
  const alarm = pickSyncAlarm({
    pullRequests: [{ number: 41, url: 'https://github.com/example/app/pull/41', createdAt, red }],
    issueTitles: [],
    now: new Date('2026-03-12T12:00:00Z'),
  });

  expect(alarm).toStrictEqual({ kind: 'quiet' });
});

test('it stays quiet when an open issue already raises the same pull request', () => {
  const alarm = pickSyncAlarm({
    pullRequests: [
      {
        number: 41,
        url: 'https://github.com/example/app/pull/41',
        createdAt: '2026-03-01T00:00:00Z',
        red: true,
      },
    ],
    issueTitles: ['repo-sync: pull request #41 is red for more than a day'],
    now: new Date('2026-03-12T12:00:00Z'),
  });

  expect(alarm).toStrictEqual({ kind: 'quiet' });
});

test('it stays quiet when no sync pull request is open', () => {
  const alarm = pickSyncAlarm({
    pullRequests: [],
    issueTitles: [],
    now: new Date('2026-03-12T12:00:00Z'),
  });

  expect(alarm).toStrictEqual({ kind: 'quiet' });
});
