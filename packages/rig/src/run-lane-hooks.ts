import type { LaneHooks } from './lane-hooks.ts';

type LaneOutcome =
  | { readonly kind: 'exited'; readonly exitCode: number }
  | { readonly kind: 'failed'; readonly error: unknown };

// When the run and the stop hook both fail, the error holds both, the run's first, so the stop
// hook's failure never hides the cause of the run's.
export async function runLaneHooks(testArgs: readonly string[], hooks: LaneHooks): Promise<number> {
  const outcome = await runStartedLane(testArgs, hooks).then(
    (exitCode): LaneOutcome => ({ kind: 'exited', exitCode }),
    (error: unknown): LaneOutcome => ({ kind: 'failed', error }),
  );

  try {
    await hooks.stop();
  } catch (stopError) {
    throw outcome.kind === 'failed'
      ? new AggregateError([outcome.error, stopError], 'the lane failed, and so did its stop hook')
      : stopError;
  }

  if (outcome.kind === 'failed') {
    throw outcome.error;
  }

  return outcome.exitCode;
}

async function runStartedLane(testArgs: readonly string[], hooks: LaneHooks): Promise<number> {
  const started = await hooks.start();

  if (started.kind === 'finish') {
    return started.exitCode;
  }

  return hooks.run(testArgs, started.environment);
}
