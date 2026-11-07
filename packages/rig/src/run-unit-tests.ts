import { join } from 'node:path';
import { match } from 'ts-pattern';
import { buildDietCommand } from './build-diet-command.ts';
import { buildUnitCommand } from './build-unit-command.ts';
import type { TestRun } from './collect-test-runs.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import type { UnitRunPlanRequest } from './pick-unit-run-plan.ts';
import { pickUnitRunPlan } from './pick-unit-run-plan.ts';
import type { CommandOptions } from './run-command.ts';
import type { RigConfig, RigOutput, RigRun } from './types.ts';

export interface UnitRequest extends UnitRunPlanRequest {
  readonly workerCount: number;
}

export interface UnitRunDeps {
  readonly dietScript: string;

  readonly probeWorkspaceRepo: (repoRoot: string) => Promise<boolean>;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly runCommand: (command: readonly string[], options: CommandOptions) => Promise<number>;

  readonly output: RigOutput;
}

export async function runUnitTests(
  config: RigConfig,
  request: UnitRequest,
  run: RigRun,
  deps: UnitRunDeps,
): Promise<number> {
  const trackedFiles = await deps.readTrackedFiles(run.repoRoot);
  const isWorkspaceRepo = await deps.probeWorkspaceRepo(run.repoRoot);

  return match(pickUnitRunPlan(config, request, trackedFiles))
    .with({ kind: 'refused' }, (refused) => {
      deps.output.err(refused.message);

      return 2;
    })
    .with({ kind: 'runs' }, (plan) =>
      runTestRuns(plan.testRuns, pickE2EDirs(trackedFiles, isWorkspaceRepo), {
        config,
        request,
        run,
        deps,
      }),
    )
    .exhaustive();
}

interface TestRunsContext {
  readonly config: RigConfig;

  readonly request: UnitRequest;

  readonly run: RigRun;

  readonly deps: UnitRunDeps;
}

// The unit lane's command is built from the lane table, so a lane that the table lists never
// reaches the unit run. Every run goes ahead after one fails, so the output shows every failure.
async function runTestRuns(
  testRuns: readonly TestRun[],
  e2eDirs: readonly string[],
  ctx: TestRunsContext,
): Promise<number> {
  const memory = ctx.config.lanes.find((lane) => lane.name === 'unit')?.memory ?? null;
  let exitCode = 0;

  for (const testRun of testRuns) {
    const runExitCode = await ctx.deps.runCommand(
      buildDietCommand(
        ctx.deps.dietScript,
        memory,
        buildUnitCommand(ctx.config, {
          e2eDirs,
          workerCount: ctx.request.workerCount,
          testRun,
          flags: ctx.request.flags,
        }),
      ),
      {
        cwd: join(ctx.run.repoRoot, testRun.folder),
        environment: ctx.run.environment,
        signal: ctx.run.signal,
      },
    );

    exitCode = exitCode === 0 ? runExitCode : exitCode;

    if (ctx.run.signal.aborted) {
      break;
    }
  }

  return exitCode;
}
