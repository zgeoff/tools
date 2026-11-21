import type { FakeClock } from '@zgeoff/testing/clock';
import { runClockUntil } from '@zgeoff/testing/clock';
import { trackSettled } from './track-settled.ts';

// The longest a test waits on a clock, in the clock's own time.
const maxClockMs = 60_000;

// Steps the fake clock until the promise settles, then returns the promise, so a test awaits code
// that sleeps on the clock with no real wait.
export async function runClockUntilSettled<Result>(
  clock: FakeClock,
  promise: Promise<Result>,
): Promise<Result> {
  const state = trackSettled(promise);

  await runClockUntil(clock, state.isSettled, { maxMs: maxClockMs });

  return promise;
}
