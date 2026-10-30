import { buildDietCommand } from './build-diet-command.ts';
import { buildUnitCommand } from './build-unit-command.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import type { CommandOptions } from './run-command.ts';
import type { RigConfig, RigRun } from './types.ts';

export interface UnitRequest {
  readonly workerCount: number;

  readonly extraArgs: readonly string[];
}

export interface UnitRunDeps {
  readonly dietScript: string;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly runCommand: (command: readonly string[], options: CommandOptions) => Promise<number>;
}

// The unit lane's command is built from the lane table, so a lane that the table lists never
// reaches the unit run.
export async function runUnitTests(
  config: RigConfig,
  request: UnitRequest,
  run: RigRun,
  deps: UnitRunDeps,
): Promise<number> {
  const trackedFiles = await deps.readTrackedFiles(run.repoRoot);

  const e2eDirs = pickE2EDirs(trackedFiles);
  const memory = config.lanes.find((lane) => lane.name === 'unit')?.memory ?? null;

  return deps.runCommand(
    buildDietCommand(
      deps.dietScript,
      memory,
      buildUnitCommand(config, e2eDirs, request.workerCount, request.extraArgs),
    ),
    { cwd: run.repoRoot, environment: run.environment, signal: run.signal },
  );
}
