export interface WaitForOptions {
  readonly intervalMs?: number;

  readonly timeoutMs?: number;

  // Names what the test waits for, in the timeout message.
  readonly label?: string;
}

const defaultIntervalMs = 20;
const defaultTimeoutMs = 5000;

const pendingAttempt = new Error('the attempt had not finished');

// Calls attempt at once, and again every intervalMs while it throws or rejects. Resolves with the
// first value it returns. Once timeoutMs passes, even while an attempt is pending, throws an error
// whose cause is the last error. No attempt starts after the deadline.
export async function waitFor<T>(
  attempt: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs ?? defaultIntervalMs;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = pendingAttempt;

  for (;;) {
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      throw buildTimeoutError(timeoutMs, options.label, lastError);
    }

    const outcome = await raceDeadline(attempt, remainingMs);

    if (outcome.kind === 'value') {
      return outcome.value;
    }

    if (outcome.kind === 'error') {
      lastError = outcome.error;
    }

    const leftMs = Math.max(deadline - Date.now(), 0);

    await Bun.sleep(Math.min(intervalMs, leftMs));
  }
}

function buildTimeoutError(timeoutMs: number, label: string | undefined, cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const subject = label === undefined ? '' : ` waiting for ${label}`;

  return new Error(`timed out after ${timeoutMs} ms${subject}: ${reason}`, { cause });
}

type Outcome<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'error'; readonly error: unknown }
  | { readonly kind: 'deadline' };

async function raceDeadline<T>(
  attempt: () => T | Promise<T>,
  remainingMs: number,
): Promise<Outcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<Outcome<T>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'deadline' }), remainingMs);
  });

  const settled = (async (): Promise<Outcome<T>> => {
    try {
      return { kind: 'value', value: await attempt() };
    } catch (error) {
      return { kind: 'error', error };
    }
  })();

  try {
    return await Promise.race([settled, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
