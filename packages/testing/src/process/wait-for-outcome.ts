import { pollIntervalMs } from './constants.ts';

export interface WaitProbes {
  readonly deadlineMs: number;

  readonly probeExited: () => boolean;

  // Waits briefly for the output that the program printed before it exited.
  readonly settleOutput: () => Promise<unknown>;
}

export type WaitOutcome<Value> =
  | { readonly kind: 'ready'; readonly value: Value }
  | { readonly kind: 'exited' }
  | { readonly kind: 'timeout' };

const pastDeadline = Symbol('pastDeadline');

// Polls `read` until it gives a value, the program exits or the deadline passes. After an exit,
// `read` runs once more on the settled output, so a line printed just before the exit still counts.
export async function waitForOutcome<Value>(
  read: () => Promise<Value | null> | Value | null,
  probes: WaitProbes,
): Promise<WaitOutcome<Value>> {
  const deadline = Date.now() + probes.deadlineMs;

  while (Date.now() < deadline) {
    const hasExited = probes.probeExited();

    if (hasExited) {
      await probes.settleOutput();
    }

    // A read that outlasts the deadline counts for nothing, and one that never settles must not
    // hold the wait past it.
    const remainingMs = Math.max(deadline - Date.now(), 0);

    const value = await Promise.race([read(), waitPastDeadline(remainingMs)]);

    if (value === pastDeadline) {
      return { kind: 'timeout' };
    }

    if (value !== null) {
      return { kind: 'ready', value };
    }

    if (hasExited) {
      return { kind: 'exited' };
    }

    await Bun.sleep(pollIntervalMs);
  }

  return { kind: 'timeout' };
}

async function waitPastDeadline(remainingMs: number): Promise<typeof pastDeadline> {
  await Bun.sleep(remainingMs);

  return pastDeadline;
}
