import type { WorkerCount } from './read-worker-count.ts';
import type { UnitRunDeps } from './run-unit-tests.ts';
import { runUnitTests } from './run-unit-tests.ts';
import type { RigConfig, RigOutput, RigRun } from './types.ts';

export interface UnitDeps extends UnitRunDeps {
  readonly readWorkerCount: () => Promise<WorkerCount>;

  readonly output: RigOutput;
}

export async function runUnit(
  config: RigConfig,
  extraArgs: readonly string[],
  run: RigRun,
  deps: UnitDeps,
): Promise<number> {
  const workers = await deps.readWorkerCount();

  if (workers.kind === 'invalid') {
    deps.output.err(`rig: ${workers.message}\n`);

    return 2;
  }

  return runUnitTests(config, { workerCount: workers.count, extraArgs }, run, deps);
}
