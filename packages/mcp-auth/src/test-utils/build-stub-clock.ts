import type { Clock } from '../types.ts';

// A clock a test moves by hand. It starts at the real time, since better-auth
// stamps tokens and codes from Date.now(); a test that steps past a token's
// life also sets the system time with bun:test.
export function buildStubClock(startMs: number = Date.now()): Clock & {
  readonly setTime: (timeMs: number) => void;
  readonly advance: (durationMs: number) => void;
} {
  let time = startMs;

  return {
    now: () => time,
    setTime: (timeMs) => {
      time = timeMs;
    },
    advance: (durationMs) => {
      time += durationMs;
    },
  };
}
