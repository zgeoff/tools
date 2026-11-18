import { match } from 'ts-pattern';
import type { LaneHooks } from './lane-hooks.ts';

type LaneOutcome =
  | { readonly kind: 'exited'; readonly exitCode: number }
  | { readonly kind: 'failed'; readonly error: unknown };

export async function runLaneHooks(testArgs: readonly string[], hooks: LaneHooks): Promise<number> {
  const outcome = await runStartedLane(testArgs, hooks).then(
    (exitCode): LaneOutcome => ({ kind: 'exited', exitCode }),
    (error: unknown): LaneOutcome => ({ kind: 'failed', error }),
  );

  try {
    await hooks.stop();
  } catch (stopError) {
    throw buildStopFailure(outcome, stopError);
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

function buildStopFailure(outcome: LaneOutcome, stopError: unknown): unknown {
  return match(outcome)
    .with({ kind: 'failed' }, (failed) => buildLaneAndStopFailure(failed.error, stopError))
    .with({ kind: 'exited', exitCode: 0 }, () => stopError)
    .with({ kind: 'exited' }, (exited) =>
      buildLaneAndStopFailure(new Error(`the lane exited with code ${exited.exitCode}`), stopError),
    )
    .exhaustive();
}

function buildLaneAndStopFailure(laneError: unknown, stopError: unknown): AggregateError {
  return new AggregateError([laneError, stopError], 'the lane failed, and so did its stop hook');
}
