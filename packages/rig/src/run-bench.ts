import { basename, join } from 'node:path';
import { pickExitCodeAfterTests } from './browser/pick-exit-code-after-tests.ts';
import { buildDietCommand } from './build-diet-command.ts';
import { buildProgramLaneHooks } from './build-program-lane-hooks.ts';
import { collectBenchFiles } from './collect-bench-files.ts';
import type { LaneHooks } from './lane-hooks.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
import { runLaneHooks } from './run-lane-hooks.ts';
import type { ProgramBuildDeps } from './run-program-builds.ts';
import { runProgramBuilds } from './run-program-builds.ts';
import type { RigConfig, RigRun } from './types.ts';

export interface BenchDeps extends ProgramBuildDeps {
  readonly dietScript: string;

  // The script that runs one bench file.
  readonly benchScript: string;

  readonly probeWorkspaceRepo: (repoRoot: string) => Promise<boolean>;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly importModule: (path: string) => Promise<unknown>;
}

// Builds each program once, as `rig e2e` does, then runs each bench file in a process of its own,
// between the start and stop hooks of the bench lane when the config names one. The bench process
// gets RIG_PROGRAM_<NAME> for each program, so resolveProgram gives the built artifact.
export async function runBench(
  args: readonly string[],
  config: RigConfig,
  run: RigRun,
  deps: BenchDeps,
): Promise<number> {
  if (args.length > 1) {
    deps.output.err('rig bench: takes at most one benchmark name\n');

    return 2;
  }

  const isWorkspaceRepo = await deps.probeWorkspaceRepo(run.repoRoot);
  const trackedFiles = await deps.readTrackedFiles(run.repoRoot);

  const benchFiles = collectBenchFiles(trackedFiles, isWorkspaceRepo);
  const [name] = args;

  const files =
    name === undefined ? benchFiles : benchFiles.filter((file) => toBenchName(file) === name);

  if (files.length === 0) {
    return reportNoBenchmark(name, benchFiles, deps);
  }

  const buildExitCode = await runProgramBuilds(config.programs, run, deps);

  if (buildExitCode !== 0) {
    return buildExitCode;
  }

  const hooks = buildProgramLaneHooks(
    makeBenchHooks(config, run, deps),
    run.repoRoot,
    config.programs,
  );

  const exitCode = await runLaneHooks(files, hooks);

  return pickExitCodeAfterTests(exitCode, run.signal.aborted);
}

function toBenchName(file: string): string {
  return basename(file, '.bench.ts');
}

function reportNoBenchmark(
  name: string | undefined,
  benchFiles: readonly string[],
  deps: BenchDeps,
): number {
  if (name === undefined) {
    deps.output.out('rig: the repo has no benchmarks\n');

    return 0;
  }

  const names = benchFiles.map((file) => toBenchName(file)).join(', ');

  deps.output.err(`rig bench: no benchmark named "${name}"; the benchmarks are ${names}\n`);

  return 1;
}

function makeBenchHooks(config: RigConfig, run: RigRun, deps: BenchDeps): LaneHooks {
  const lane = config.lanes.find((candidate) => candidate.name === config.benchLane);

  const laneHooks: Pick<LaneHooks, 'start' | 'stop'> =
    lane === undefined
      ? {
          start: () => Promise.resolve({ kind: 'proceed', environment: run.environment }),
          stop: () => Promise.resolve(),
        }
      : makeRepoLaneHooks({
          context: { repoRoot: run.repoRoot, lane, runID: run.runID, environment: run.environment },
          dietScript: deps.dietScript,
          parallel: 1,
          signal: run.signal,
          importModule: deps.importModule,
          runCommand: deps.runCommand,
        });

  return {
    ...laneHooks,
    run: async (files, environment) => {
      let exitCode = 0;

      for (const file of files) {
        const fileExitCode = await deps.runCommand(
          buildDietCommand(deps.dietScript, lane?.memory ?? null, [
            'bun',
            deps.benchScript,
            join(run.repoRoot, file),
          ]),
          { cwd: run.repoRoot, environment, signal: run.signal },
        );

        exitCode = fileExitCode === 0 ? exitCode : 1;
      }

      return exitCode;
    },
  };
}
