import { expect, test } from 'bun:test';
import { buildProcessEntry } from '../test-utils/build-process-entry.ts';
import { pickFreezeStep } from './pick-freeze-step.ts';

test('it picks freeze with each descendant of the root that is not frozen yet', () => {
  const step = pickFreezeStep({
    rootPID: 4100,
    listing: [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(4150, 4120),
      buildProcessEntry(5200, 1),
    ],
    frozen: [4120, 4130],
    isPastDeadline: false,
  });

  expect(step).toStrictEqual({ kind: 'freeze', pids: [4150] });
});

test('it picks frozen once the listing shows no descendant that is not frozen', () => {
  const step = pickFreezeStep({
    rootPID: 4100,
    listing: [
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
    ],
    frozen: [4120, 4130],
    isPastDeadline: false,
  });

  expect(step).toStrictEqual({ kind: 'frozen' });
});

test('it picks retry for a failed listing before the deadline', () => {
  const step = pickFreezeStep({
    rootPID: 4100,
    listing: null,
    frozen: [4120],
    isPastDeadline: false,
  });

  expect(step).toStrictEqual({ kind: 'retry' });
});

test('it picks failed for a failed listing at the deadline, when no process is frozen', () => {
  const step = pickFreezeStep({ rootPID: 4100, listing: null, frozen: [], isPastDeadline: true });

  expect(step).toStrictEqual({ kind: 'failed' });
});

test('it picks frozen for a failed listing at the deadline, so the frozen processes get killed', () => {
  const step = pickFreezeStep({
    rootPID: 4100,
    listing: null,
    frozen: [4120, 4130],
    isPastDeadline: true,
  });

  expect(step).toStrictEqual({ kind: 'frozen' });
});

test('it picks frozen at the deadline, though the listing shows a descendant that is not frozen', () => {
  const step = pickFreezeStep({
    rootPID: 4100,
    listing: [buildProcessEntry(4100, 4000), buildProcessEntry(4120, 4100)],
    frozen: [],
    isPastDeadline: true,
  });

  expect(step).toStrictEqual({ kind: 'frozen' });
});
