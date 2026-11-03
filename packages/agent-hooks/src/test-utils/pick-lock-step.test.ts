import { expect, test } from 'bun:test';
import { pickLockStep } from './pick-lock-step.ts';

test.each([
  ['the lock is taken', { isLocked: true, nowMs: 1000, deadlineMs: 900 }, 'acquired'],
  [
    'the lock is busy before the deadline',
    { isLocked: false, nowMs: 800, deadlineMs: 900 },
    'wait',
  ],
  ['the lock is busy at the deadline', { isLocked: false, nowMs: 900, deadlineMs: 900 }, 'give-up'],
] as const)('it picks the step when %s', (_, attempt, expected) => {
  expect(pickLockStep(attempt)).toBe(expected);
});
