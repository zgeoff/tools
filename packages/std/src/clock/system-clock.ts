export interface Clock {
  // Epoch milliseconds.
  readonly now: () => number;

  // Returns a cancel function. A negative delay counts as 0.
  readonly schedule: (fire: () => void, delayMs: number) => () => void;

  // Resolves early when the signal aborts, and never rejects.
  readonly sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),

  schedule: (fire, delayMs) => {
    const timer = setTimeout(fire, Math.max(0, delayMs));

    return () => {
      clearTimeout(timer);
    };
  },

  sleep: (delayMs, signal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted === true) {
        resolve();

        return;
      }

      const finish = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', finish);
        resolve();
      };

      const timer = setTimeout(finish, Math.max(0, delayMs));

      signal?.addEventListener('abort', finish, { once: true });
    }),
};
