export interface WaitForOptions {
  readonly intervalMs?: number;

  readonly timeoutMs?: number;

  // Names what the test waits for, in the timeout message.
  readonly label?: string;
}

const defaultIntervalMs = 20;
const defaultTimeoutMs = 5000;

// Calls attempt at once, and again every intervalMs while it throws or rejects. Resolves with the
// first value it returns. Once timeoutMs passes, throws an error whose cause is the last error.
export async function waitFor<T>(
  attempt: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs ?? defaultIntervalMs;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (Date.now() >= deadline) {
        throw buildTimeoutError(timeoutMs, options.label, error);
      }
    }

    await Bun.sleep(intervalMs);
  }
}

function buildTimeoutError(timeoutMs: number, label: string | undefined, cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const subject = label === undefined ? '' : ` waiting for ${label}`;

  return new Error(`timed out after ${timeoutMs} ms${subject}: ${reason}`, { cause });
}
