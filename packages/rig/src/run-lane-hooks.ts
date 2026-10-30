import type { LaneHooks } from './lane-hooks.ts';

export async function runLaneHooks(testArgs: readonly string[], hooks: LaneHooks): Promise<number> {
  try {
    const outcome = await hooks.start();

    if (outcome.kind === 'finish') {
      return outcome.exitCode;
    }

    return await hooks.run(testArgs, outcome.environment);
  } finally {
    await hooks.stop();
  }
}
