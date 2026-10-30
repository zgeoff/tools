export type LaneEnvironment = Readonly<Record<string, string | undefined>>;

export type LaneStartOutcome =
  | { readonly kind: 'proceed'; readonly environment: LaneEnvironment }
  | { readonly kind: 'finish'; readonly exitCode: number };

// The three steps of a lane run. `start` prepares what the tests need, and either hands on the
// environment of the test process or finishes the run early. `stop` always runs.
export interface LaneHooks {
  readonly start: () => Promise<LaneStartOutcome>;

  readonly run: (testArgs: readonly string[], environment: LaneEnvironment) => Promise<number>;

  readonly stop: () => Promise<void>;
}
