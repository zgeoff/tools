import { mock } from 'bun:test';
import type { Clock } from './system-clock.ts';

// A clock that starts at 0 and moves only when a sleep moves it, so a deadline passes with no
// real wait.
export function buildSteppingClock() {
  const time = { nowMs: 0 };

  return {
    now: () => time.nowMs,
    sleep: mock<Clock['sleep']>((durationMs) => {
      time.nowMs += durationMs;

      return Promise.resolve();
    }),
  } satisfies Clock;
}
