import { expect, test } from 'bun:test';
import { pickSyncCommitVerdict } from './pick-sync-commit-verdict.ts';

test('it refuses a commit that is not on main whatever the pins', () => {
  const verdict = pickSyncCommitVerdict({
    commit: 'b2',
    isOnMain: false,
    base: 'main',
    basePins: { kind: 'read', pins: [{ pin: 'c3', order: 'newer' }] },
    pullRequest: null,
  });

  expect(verdict).toStrictEqual({
    kind: 'refused',
    message: 'b2 is not a commit on main of zgeoff/tools',
  });
});

test('it refuses when the base cannot be read', () => {
  const verdict = pickSyncCommitVerdict({
    commit: 'b2',
    isOnMain: true,
    base: 'main',
    basePins: { kind: 'unreadable', reason: 'fatal: could not read from remote' },
    pullRequest: null,
  });

  expect(verdict).toStrictEqual({
    kind: 'refused',
    message:
      'Cannot read main from the remote, so the run cannot tell whether b2 is older than its pin; the next run tries again: fatal: could not read from remote',
  });
});

test('it reports the base as the holder when any of its pins is newer', () => {
  const verdict = pickSyncCommitVerdict({
    commit: 'b2',
    isOnMain: true,
    base: 'main',
    basePins: {
      kind: 'read',
      pins: [
        { pin: 'a1', order: 'not-newer' },
        { pin: 'c3', order: 'newer' },
      ],
    },
    pullRequest: {
      number: '7',
      branch: 'repo-sync/zgeoff-tools',
      pins: { kind: 'read', pins: [] },
    },
  });

  expect(verdict).toStrictEqual({ kind: 'superseded', holder: 'main', pin: 'c3' });
});

test('it refuses when it cannot order a pin of the base against the commit', () => {
  const verdict = pickSyncCommitVerdict({
    commit: 'b2',
    isOnMain: true,
    base: 'main',
    basePins: {
      kind: 'read',
      pins: [{ pin: 'f9', order: 'unknown', reason: 'fatal: bad object f9' }],
    },
    pullRequest: null,
  });

  expect(verdict).toStrictEqual({
    kind: 'refused',
    message:
      'Cannot tell whether b2 is older than the pin f9 on main, so the run stops; the next run tries again: fatal: bad object f9',
  });
});

test('it syncs when no pin is newer and no pull request is open', () => {
  const verdict = pickSyncCommitVerdict({
    commit: 'b2',
    isOnMain: true,
    base: 'main',
    basePins: { kind: 'read', pins: [{ pin: 'a1', order: 'not-newer' }] },
    pullRequest: null,
  });

  expect(verdict).toStrictEqual({ kind: 'current' });
});

test('it reports the open pull request as the holder when its branch pins a newer commit', () => {
  const verdict = pickSyncCommitVerdict({
    commit: 'b2',
    isOnMain: true,
    base: 'main',
    basePins: { kind: 'read', pins: [] },
    pullRequest: {
      number: '7',
      branch: 'repo-sync/zgeoff-tools',
      pins: { kind: 'read', pins: [{ pin: 'c3', order: 'newer' }] },
    },
  });

  expect(verdict).toStrictEqual({ kind: 'superseded', holder: 'Pull request #7', pin: 'c3' });
});

test('it refuses when the branch of the open pull request cannot be read', () => {
  const verdict = pickSyncCommitVerdict({
    commit: 'b2',
    isOnMain: true,
    base: 'main',
    basePins: { kind: 'read', pins: [] },
    pullRequest: {
      number: '7',
      branch: 'repo-sync/zgeoff-tools',
      pins: { kind: 'unreadable', reason: "fatal: couldn't find remote ref" },
    },
  });

  expect(verdict).toStrictEqual({
    kind: 'refused',
    message:
      "Cannot read repo-sync/zgeoff-tools from the remote, so the run cannot tell whether b2 is older than its pin; the next run tries again: fatal: couldn't find remote ref",
  });
});

test('it syncs when the open pull request pins no newer commit', () => {
  const verdict = pickSyncCommitVerdict({
    commit: 'b2',
    isOnMain: true,
    base: 'main',
    basePins: { kind: 'read', pins: [] },
    pullRequest: {
      number: '7',
      branch: 'repo-sync/zgeoff-tools',
      pins: { kind: 'read', pins: [{ pin: 'b2', order: 'not-newer' }] },
    },
  });

  expect(verdict).toStrictEqual({ kind: 'current' });
});
