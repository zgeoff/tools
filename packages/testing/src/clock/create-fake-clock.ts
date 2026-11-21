import type { CreateFakeClockOptions, FakeClock } from './types.ts';

interface PendingTimer {
  readonly dueMs: number;
  readonly order: number;
  readonly fire: () => void;
}

// A clock that moves only when the test calls advance. Each timer and sleep counts as pending until
// it fires, is cancelled or is aborted.
export function createFakeClock(options: CreateFakeClockOptions = {}): FakeClock {
  let nowMs = options.startMs ?? 0;
  let nextOrder = 0;

  const pending = new Set<PendingTimer>();

  const delays: number[] = [];

  const addTimer = (fire: () => void, delayMs: number): (() => void) => {
    delays.push(delayMs);

    const timer: PendingTimer = { dueMs: nowMs + Math.max(0, delayMs), order: nextOrder, fire };

    nextOrder += 1;

    pending.add(timer);

    return () => {
      pending.delete(timer);
    };
  };

  const findNextTimer = (): PendingTimer | null => {
    let next: PendingTimer | null = null;

    for (const timer of pending) {
      if (
        next === null ||
        timer.dueMs < next.dueMs ||
        (timer.dueMs === next.dueMs && timer.order < next.order)
      ) {
        next = timer;
      }
    }

    return next;
  };

  const schedule = (fire: () => void, delayMs: number): (() => void) => addTimer(fire, delayMs);

  const sleep = (delayMs: number, signal?: AbortSignal): Promise<void> =>
    new Promise<void>((resolve) => {
      if (signal?.aborted === true) {
        delays.push(delayMs);

        resolve();

        return;
      }

      const finish = (): void => {
        cancel();
        signal?.removeEventListener('abort', finish);
        resolve();
      };

      const cancel = addTimer(finish, delayMs);

      signal?.addEventListener('abort', finish, { once: true });
    });

  const advance = (durationMs: number): void => {
    const targetMs = nowMs + Math.max(0, durationMs);

    for (
      let next = findNextTimer();
      next !== null && next.dueMs <= targetMs;
      next = findNextTimer()
    ) {
      pending.delete(next);

      nowMs = next.dueMs;

      next.fire();
    }

    nowMs = targetMs;
  };

  return {
    now: () => nowMs,
    schedule,
    sleep,
    advance,
    readNextDueMs: () => findNextTimer()?.dueMs ?? null,
    countPending: () => pending.size,
    delays,
  };
}
