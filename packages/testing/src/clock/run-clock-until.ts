import type { FakeClock, RunClockUntilOptions } from './types.ts';

const maxIdleSteps = 100;

// Steps the clock to each next due time, with one setImmediate turn after each step so the code
// that the step woke can run, until the condition holds. Throws when the clock reaches maxMs past
// its start with the condition false, or when nothing is scheduled for 100 turns in a row.
export async function runClockUntil(
  clock: FakeClock,
  isMet: () => boolean,
  options: RunClockUntilOptions,
): Promise<void> {
  if (isMet()) {
    return;
  }

  const limitMs = clock.now() + options.maxMs;
  let idleSteps = 0;

  for (;;) {
    const nextDueMs = clock.readNextDueMs();

    if (nextDueMs === null) {
      await waitOneTurn();

      if (isMet()) {
        return;
      }

      idleSteps += 1;

      if (idleSteps >= maxIdleSteps) {
        throw new Error('nothing is scheduled and the condition is still false');
      }

      continue;
    }

    idleSteps = 0;

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

function waitOneTurn(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
