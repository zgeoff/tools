import { match } from 'ts-pattern';
import { buildTestSelection } from './build-test-selection.ts';
import { parseTestArgs } from './parse-test-args.ts';
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

  const unitLane = config.lanes.find((lane) => lane.name === 'unit');

  if (unitLane === undefined) {
    throw new Error('the rig config holds no unit lane');
  }

  const selection = buildTestSelection({
    config,
    lane: unitLane,
    repoRoot: run.repoRoot,
    trackedFiles: await deps.readTrackedFiles(run.repoRoot),
    args: parseTestArgs(extraArgs),
  });

  return match(selection)
    .with({ kind: 'none' }, () => {
      deps.output.out('rig: the unit lane has no tests that match the paths\n');

      return 0;
    })
    .with({ kind: 'files' }, (files) =>
      runUnitTests(
        config,
        { workerCount: workers.count, extraArgs: [...files.files, ...files.flags] },
        run,
        deps,
      ),
    )
    .with({ kind: 'lane' }, (laneRun) =>
      runUnitTests(config, { workerCount: workers.count, extraArgs: laneRun.flags }, run, deps),
    )
    .exhaustive();
}
