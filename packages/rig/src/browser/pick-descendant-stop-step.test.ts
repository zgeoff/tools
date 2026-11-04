import { expect, test } from 'bun:test';
import { buildProcessEntry } from '../test-utils/build-process-entry.ts';
import { pickDescendantStopStep } from './pick-descendant-stop-step.ts';

test('it picks stopped when no descendant is in the listing', () => {
  const step = pickDescendantStopStep({
    descendants: [4120, 4130],
    listing: [buildProcessEntry(4100, 4000), buildProcessEntry(5200, 1)],
    isPastDeadline: false,
  });

  expect(step).toStrictEqual({ kind: 'stopped' });
});

test('it picks wait while a descendant, even a zombie, is in the listing before the deadline', () => {
  const step = pickDescendantStopStep({
    descendants: [4120, 4130],
    listing: [buildProcessEntry(4100, 4000), buildProcessEntry(4130, 1, 'Z')],
    isPastDeadline: false,
  });

  expect(step).toStrictEqual({ kind: 'wait' });
});

test('it picks stopped at the deadline when only zombies remain, which no process reaps', () => {
  const step = pickDescendantStopStep({
    descendants: [4120, 4130],
    listing: [buildProcessEntry(4120, 1, 'Z'), buildProcessEntry(4130, 1, 'Z+')],
    isPastDeadline: true,
  });

  expect(step).toStrictEqual({ kind: 'stopped' });
});

test('it picks failed at the deadline with each descendant that is no zombie', () => {
  const step = pickDescendantStopStep({
    descendants: [4120, 4130, 4140],
    listing: [
      buildProcessEntry(4120, 4100, 'Sl'),
      buildProcessEntry(4130, 1, 'Z'),
      buildProcessEntry(4140, 4120, 'R'),
    ],
    isPastDeadline: true,
  });

  expect(step).toStrictEqual({ kind: 'failed', running: [4120, 4140] });
});

test('it picks wait on a failed listing before the deadline', () => {
  const step = pickDescendantStopStep({
    descendants: [4120, 4130],
    listing: null,
    isPastDeadline: false,
  });

  expect(step).toStrictEqual({ kind: 'wait' });
});

test('it picks failed with every descendant on a failed listing at the deadline', () => {
  const step = pickDescendantStopStep({
    descendants: [4120, 4130],
    listing: null,
    isPastDeadline: true,
  });

  expect(step).toStrictEqual({ kind: 'failed', running: [4120, 4130] });
});
