export interface SettledState {
  readonly isSettled: () => boolean;

  // Resolves once the promise settles, whether it resolves or rejects.
  readonly settled: Promise<void>;
}

interface MutableSettledState {
  isSettled: boolean;
}

export function trackSettled(promise: Promise<unknown>): SettledState {
  const state: MutableSettledState = { isSettled: false };
  const settled = markSettled(promise, state);

  return { isSettled: () => state.isSettled, settled };
}

async function markSettled(promise: Promise<unknown>, state: MutableSettledState): Promise<void> {
  await Promise.allSettled([promise]);

  state.isSettled = true;
}
