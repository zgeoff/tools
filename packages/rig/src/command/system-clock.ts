export interface Clock {
  readonly now: () => number;

  readonly sleep: (durationMs: number) => Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (durationMs) => Bun.sleep(durationMs),
};
