export interface WaitForOptions {
  readonly intervalMs?: number;

  readonly timeoutMs?: number;

  // Names what the test waits for, in the timeout message.
  readonly label?: string;

  // An abort stops the wait and rejects with the signal's reason.
  readonly signal?: AbortSignal;

  // Read after each attempt. When its value changes between reads, by Object.is, the deadline
  // starts again.
  readonly progress?: () => unknown;

  readonly now?: () => number;

  readonly sleep?: (delayMs: number) => Promise<void>;
}

const defaultIntervalMs = 20;
const defaultTimeoutMs = 5000;

const pendingAttempt = new Error('the attempt had not finished');

interface AttemptState {
  isDone: boolean;
}

type Interruption = { readonly kind: 'deadline' } | { readonly kind: 'aborted' };

// Calls attempt at once, and again every intervalMs while it throws or rejects. Resolves with the
// first value it returns, whatever that value is. Once the deadline passes, even while an attempt
// is pending, throws an error whose cause is the last error. No attempt starts after the deadline.
export async function waitFor<T>(
  attempt: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs ?? defaultIntervalMs;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const now = options.now ?? (() => performance.now());

  const timers = new Set<ReturnType<typeof setTimeout>>();

  const sleep = options.sleep ?? makeCancellableSleep(timers);
  const abort = watchAbort(options.signal);

  const deadline = {
    atMs: now() + timeoutMs,
    seenProgress: options.progress?.(),
  };

  // Moves the deadline out when the progress value has changed since the last read.
  const readProgress = (): void => {
    if (options.progress === undefined) {
      return;
    }

    const progress = options.progress();

    if (!Object.is(progress, deadline.seenProgress)) {
      deadline.seenProgress = progress;
      deadline.atMs = now() + timeoutMs;
    }
  };

  // Settles at the deadline, and only for an attempt that is still pending after the event loop
  // has turned once, so an attempt that answers at once never waits on the sleep. A deadline that
  // moved while the sleep ran gets a new sleep.
  const watchDeadline = async (attemptState: AttemptState): Promise<Interruption> => {
    await Bun.sleep(0);

    for (;;) {
      if (attemptState.isDone) {
        return new Promise<Interruption>(() => {
          // The attempt is over, so nothing waits for this.
        });
      }

      const startedForMs = deadline.atMs;

      await sleep(Math.max(startedForMs - now(), 0));

      readProgress();

      if (deadline.atMs === startedForMs) {
        return { kind: 'deadline' };
      }
    }
  };

  let lastError: unknown = pendingAttempt;
  const buildTimeout = (): Error => buildTimeoutError(timeoutMs, options.label, lastError);

  try {
    for (;;) {
      abort.throwIfAborted();

      if (now() >= deadline.atMs) {
        throw buildTimeout();
      }

      const attemptState = { isDone: false };
      const settled = settleAttempt(attempt);

      const outcome = await Promise.race([settled, watchDeadline(attemptState), abort.aborted]);

      attemptState.isDone = true;

      if (outcome.kind === 'aborted') {
        throw abort.reason();
      }

      if (outcome.kind === 'deadline') {
        throw buildTimeout();
      }

      if (outcome.kind === 'value') {
        if (now() >= deadline.atMs) {
          throw buildTimeout();
        }

        return outcome.value;
      }

      lastError = outcome.error;

      readProgress();

      const remainingMs = Math.max(deadline.atMs - now(), 0);
      const pauseMs = Math.min(intervalMs, remainingMs);

      const pause = await Promise.race([sleep(pauseMs), abort.aborted]);

      if (pause?.kind === 'aborted') {
        throw abort.reason();
      }

      // A timer can fire a little before the clock reaches the deadline.
      if (pauseMs === remainingMs) {
        throw buildTimeout();
      }
    }
  } finally {
    abort.stop();

    for (const timer of timers) {
      clearTimeout(timer);
    }
  }
}

// A sleep on a timer that the wait can cancel, so a wait that ends early leaves nothing running.
function makeCancellableSleep(
  timers: Set<ReturnType<typeof setTimeout>>,
): (delayMs: number) => Promise<void> {
  return (delayMs) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);

        resolve();
      }, delayMs);

      timers.add(timer);
    });
}

interface AbortWatch {
  // Settles when the signal aborts, and never when it does not.
  readonly aborted: Promise<Interruption>;
  readonly throwIfAborted: () => void;
  readonly reason: () => unknown;
  readonly stop: () => void;
}

function watchAbort(signal: AbortSignal | undefined): AbortWatch {
  const aborted = Promise.withResolvers<Interruption>();

  const onAbort = (): void => {
    aborted.resolve({ kind: 'aborted' });
  };

  signal?.addEventListener('abort', onAbort, { once: true });

  return {
    aborted: aborted.promise,
    throwIfAborted: () => {
      if (signal?.aborted === true) {
        throw signal.reason;
      }
    },
    reason: () => signal?.reason,
    stop: () => {
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

function buildTimeoutError(timeoutMs: number, label: string | undefined, cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const subject = label === undefined ? '' : ` waiting for ${label}`;

  return new Error(`timed out after ${timeoutMs} ms${subject}: ${reason}`, {
    cause,
  });
}

type AttemptOutcome<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'error'; readonly error: unknown };

async function settleAttempt<T>(attempt: () => T | Promise<T>): Promise<AttemptOutcome<T>> {
  try {
    return { kind: 'value', value: await attempt() };
  } catch (error) {
    return { kind: 'error', error };
  }
}
