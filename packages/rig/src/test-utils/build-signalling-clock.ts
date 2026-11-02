import type { Clock } from './system-clock.ts';

// A real clock whose first sleep also resolves a promise, so a test learns that a waiter has
// found the lock taken and started to wait.
export function buildSignallingClock() {
  const firstSleep = Promise.withResolvers<void>();

  const clock: Clock = {
    now: () => Date.now(),
    sleep: (durationMs) => {
      firstSleep.resolve();

      return Bun.sleep(durationMs);
    },
  };

  return { clock, firstSleep: firstSleep.promise };
}
