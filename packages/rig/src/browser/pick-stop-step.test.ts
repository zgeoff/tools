import { expect, test } from 'bun:test';
import { pickStopStep } from './pick-stop-step.ts';

test.each([
  {
    group: 'a group that is not running',
    phase: 'before-stop',
    isGroupRunning: false,
    isPastDeadline: false,
    expected: { kind: 'done' },
  },
  {
    group: 'a running group',
    phase: 'before-stop',
    isGroupRunning: true,
    isPastDeadline: false,
    expected: { kind: 'signal', signal: 'SIGTERM' },
  },
  {
    group: 'a group that exits after SIGTERM',
    phase: 'after-sigterm',
    isGroupRunning: false,
    isPastDeadline: false,
    expected: { kind: 'done' },
  },
  {
    group: 'a group that runs before the SIGTERM deadline',
    phase: 'after-sigterm',
    isGroupRunning: true,
    isPastDeadline: false,
    expected: { kind: 'wait' },
  },
  {
    group: 'a group that runs past the SIGTERM deadline',
    phase: 'after-sigterm',
    isGroupRunning: true,
    isPastDeadline: true,
    expected: { kind: 'signal', signal: 'SIGKILL' },
  },
  {
    group: 'a group that exits after SIGKILL',
    phase: 'after-sigkill',
    isGroupRunning: false,
    isPastDeadline: true,
    expected: { kind: 'done' },
  },
  {
    group: 'a group that runs before the SIGKILL deadline',
    phase: 'after-sigkill',
    isGroupRunning: true,
    isPastDeadline: false,
    expected: { kind: 'wait' },
  },
  {
    group: 'a group that runs past the SIGKILL deadline',
    phase: 'after-sigkill',
    isGroupRunning: true,
    isPastDeadline: true,
    expected: { kind: 'fail' },
  },
] as const)('it picks the step for $group', (row) => {
  expect(
    pickStopStep({
      phase: row.phase,
      isGroupRunning: row.isGroupRunning,
      isPastDeadline: row.isPastDeadline,
    }),
  ).toStrictEqual(row.expected);
});
