import type { FakeClock, RunClockUntilOptions } from './types.ts';

const defaultIdleMs = 2000;

// Steps the clock to each next due time until the condition holds. While nothing is pending, each
// step waits for a real 1 ms timer, so real I/O can finish and schedule the next sleep.
export async function runClockUntil(
  clock: FakeClock,
  isMet: () => boolean,
  options: RunClockUntilOptions,
): Promise<void> {
  if (isMet()) {
    return;
  }

  const limitMs = clock.now() + options.maxMs;
  const idleMs = options.idleMs ?? defaultIdleMs;
  let idleSinceMs: number | null = null;

  for (;;) {
    const nextDueMs = clock.readNextDueMs();

    if (nextDueMs === null) {
      idleSinceMs ??= performance.now();

      await waitOneMillisecond();

      if (isMet()) {
        return;
      }

      if (clock.readNextDueMs() === null && performance.now() - idleSinceMs >= idleMs) {
        throw new Error('nothing is scheduled and the condition is still false');
      }

      continue;
    }

    idleSinceMs = null;

    clock.advance(Math.min(nextDueMs, limitMs) - clock.now());

    await waitOneTurn();

    if (isMet()) {
      return;
    }

    if (clock.now() >= limitMs) {
      throw new Error(`the condition stayed false for ${options.maxMs} ms of clock time`);
    }
  }
}

function waitOneMillisecond(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 1);
  });
}

function waitOneTurn(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
