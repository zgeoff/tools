import type { FakeClock, RunClockUntilOptions } from './types.ts';

const defaultIdleMs = 2000;

// Steps the clock to each next due time until the condition holds. While nothing is pending, each
// step waits for a real 1 ms timer, so real I/O can finish and schedule the next sleep.
export async function runClockUntil(
  clock: FakeClock,
  isMet: () => boolean,
  options: RunClockUntilOptions,
): Promise<void> {
  if (options.stepMs !== undefined && !(Number.isFinite(options.stepMs) && options.stepMs > 0)) {
    throw new Error(`stepMs must be a finite number above 0, got ${options.stepMs}`);
  }

  if (isMet()) {
    return;
  }

  const limitMs = clock.now() + options.maxMs;

  if (options.stepMs !== undefined) {
    await runSteppedClock(clock, isMet, {
      stepMs: options.stepMs,
      limitMs,
      maxMs: options.maxMs,
    });

    return;
  }

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

interface SteppedLimits {
  readonly stepMs: number;
  readonly limitMs: number;
  readonly maxMs: number;
}

const steppedTurnsPerStep = 4;

// Advances the clock by stepMs a step, whatever is pending, and lets several turns pass before each
// check, so work that needs a few turns to arm the next sleep keeps up.
async function runSteppedClock(
  clock: FakeClock,
  isMet: () => boolean,
  limits: SteppedLimits,
): Promise<void> {
  await waitOneTurn();

  for (;;) {
    clock.advance(Math.min(limits.stepMs, limits.limitMs - clock.now()));

    for (let turn = 0; turn < steppedTurnsPerStep; turn += 1) {
      await waitOneTurn();
    }

    if (isMet()) {
      return;
    }

    if (clock.now() >= limits.limitMs) {
      throw new Error(`the condition stayed false for ${limits.maxMs} ms of clock time`);
    }
  }
}

function waitOneTurn(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

function waitOneMillisecond(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 1);
  });
}
