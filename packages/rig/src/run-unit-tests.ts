import { join } from 'node:path';
import { buildDietCommand } from './build-diet-command.ts';
import { buildUnitCommand } from './build-unit-command.ts';
import { collectTestRuns } from './collect-test-runs.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import type { CommandOptions } from './run-command.ts';
import type { RigConfig, RigRun } from './types.ts';

export interface UnitRequest {
  readonly workerCount: number;

  readonly flags: readonly string[];

  // The unit tests to run, relative to the repo root.
  readonly tests: readonly string[];

  // True when the run takes the whole unit lane, so the root run finds its own tests.
  readonly isDiscovery: boolean;
}

export interface UnitRunDeps {
  readonly dietScript: string;

  readonly probeWorkspaceRepo: (repoRoot: string) => Promise<boolean>;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly runCommand: (command: readonly string[], options: CommandOptions) => Promise<number>;
}

// The unit lane's command is built from the lane table, so a lane that the table lists never
// reaches the unit run. Every run goes ahead after one fails, so the output shows every failure.
export async function runUnitTests(
  config: RigConfig,
  request: UnitRequest,
  run: RigRun,
  deps: UnitRunDeps,
): Promise<number> {
  const trackedFiles = await deps.readTrackedFiles(run.repoRoot);
  const isWorkspaceRepo = await deps.probeWorkspaceRepo(run.repoRoot);

  const e2eDirs = pickE2EDirs(trackedFiles, isWorkspaceRepo);
  const memory = config.lanes.find((lane) => lane.name === 'unit')?.memory ?? null;

  const testRuns = collectTestRuns({
    bunfigs: config.bunfigs,
    trackedFiles,
    tests: request.tests,
    isDiscovery: request.isDiscovery,
  });

  let exitCode = 0;

  for (const testRun of testRuns) {
    const runExitCode = await deps.runCommand(
      buildDietCommand(
        deps.dietScript,
        memory,
        buildUnitCommand(config, {
          e2eDirs,
          workerCount: request.workerCount,
          testRun,
          flags: request.flags,
        }),
      ),
      {
        cwd: join(run.repoRoot, testRun.folder),
        environment: run.environment,
        signal: run.signal,
      },
    );

    exitCode = exitCode === 0 ? runExitCode : exitCode;

    if (run.signal.aborted) {
      break;
    }
  }

  return exitCode;
}
