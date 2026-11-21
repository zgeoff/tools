import { waitFor } from '@zgeoff/testing';
import type { FakeClock } from '@zgeoff/testing/clock';
import { trackSettled } from './track-settled.ts';

// The longest a test waits on a clock, in the clock's own time.
const maxClockMs = 60_000;

// Steps the fake clock until the promise settles, then returns the promise, so a test awaits code
// that sleeps on the clock with no real wait. Between sleeps, the code may do real file or process
// work, so each step waits in real time for the next sleep or the end.
export async function runClockUntilSettled<Result>(
  clock: FakeClock,
  promise: Promise<Result>,
): Promise<Result> {
  const state = trackSettled(promise);
  const limitMs = clock.now() + maxClockMs;

  for (;;) {
    const nextDueMs = await waitFor(() => readNextStep(clock, state.isSettled), { intervalMs: 1 });

    if (nextDueMs === null) {
      return promise;
    }

    if (nextDueMs > limitMs) {
      throw new Error(`the promise stayed pending for ${maxClockMs} ms of clock time`);
    }

    clock.advance(nextDueMs - clock.now());
  }
}

// The due time of the next sleep, null once the promise settled, or a throw while neither holds.
function readNextStep(clock: FakeClock, isSettled: () => boolean): number | null {
  if (isSettled()) {
    return null;
  }

  const nextDueMs = clock.readNextDueMs();

  if (nextDueMs === null) {
    throw new Error('the promise is pending with no sleep due');
  }

  return nextDueMs;
}
