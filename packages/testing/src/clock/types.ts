import type { Clock } from '@zgeoff/std';

export interface FakeClock extends Clock {
  // Moves the clock forward, firing each timer and resolving each sleep that falls due on the way.
  readonly advance: (durationMs: number) => void;

  // The earliest due time of a timer or a sleep, or null when none is pending.
  readonly readNextDueMs: () => number | null;

  // The timers and sleeps not yet fired, cancelled or aborted.
  readonly countPending: () => number;

  // Every delay that a caller passed to schedule or sleep, as passed, before a negative one counts
  // as 0.
  readonly delays: readonly number[];
}

export interface CreateFakeClockOptions {
  // The epoch milliseconds that now() starts at; 0 when it is unset.
  readonly startMs?: number;
}

export interface RunClockUntilOptions {
  // The most fake time to step through.
  readonly maxMs: number;

  // The real milliseconds that nothing may be pending in a row before it throws; 2000 when unset.
  readonly idleMs?: number;
}
