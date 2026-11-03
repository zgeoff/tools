import { match } from 'ts-pattern';
import { pickExitCodeAfterTests } from './browser/pick-exit-code-after-tests.ts';
import type { BrowserLaneWiring } from './browser/wire-browser-lane-hooks.ts';
import { buildProgramEnvironment } from './build-program-environment.ts';
import type { TestSelection } from './build-test-selection.ts';
import { buildTestSelection } from './build-test-selection.ts';
import { collectUnprogrammedE2EDirs } from './collect-unprogrammed-e2e-dirs.ts';
import { formatNoMatchMessage } from './format-no-match-message.ts';
import { formatNoTestsMessage } from './format-no-tests-message.ts';
import type { LaneHooks } from './lane-hooks.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
import { parseTestArgs } from './parse-test-args.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import { pickLaneSelection } from './pick-lane-selection.ts';
import { runLaneHooks } from './run-lane-hooks.ts';
import type { ProgramBuildDeps } from './run-program-builds.ts';
import { runProgramBuilds } from './run-program-builds.ts';
import type { ProgramDeclaration, ResolvedLane, RigConfig, RigRun } from './types.ts';

export interface LaneDeps extends ProgramBuildDeps {
  readonly dietScript: string;

  readonly probeWorkspaceRepo: (repoRoot: string) => Promise<boolean>;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly importModule: (path: string) => Promise<unknown>;

  readonly wireBrowserLaneHooks: (wiring: BrowserLaneWiring) => Promise<LaneHooks>;
}

export interface LaneRequest {
  readonly config: RigConfig;

  readonly lane: ResolvedLane;

  readonly extraArgs: readonly string[];
}

// A lane runs its start hook, its tests under diet, and its stop hook, which runs even when the
// start or the tests fail.
export async function runLane(request: LaneRequest, run: RigRun, deps: LaneDeps): Promise<number> {
  const lane = request.lane;

  const trackedFiles = await deps.readTrackedFiles(run.repoRoot);
  const isWorkspaceRepo = await deps.probeWorkspaceRepo(run.repoRoot);

  const selection = buildTestSelection({
    config: request.config,
    lane,
    repoRoot: run.repoRoot,
    isWorkspaceRepo,
    trackedFiles,
    args: parseTestArgs(request.extraArgs),
  });

  if (selection.kind === 'none') {
    deps.output.err(formatNoMatchMessage(lane.name, selection.paths));

    return 1;
  }

  if (selection.kind === 'empty') {
    deps.output.out(formatNoTestsMessage(lane.name));

    return 0;
  }

  const e2eDirs = pickE2EDirs(trackedFiles, isWorkspaceRepo);
  const testArgs = pickLaneTestArgs(request.config, lane, selection, e2eDirs);
  const programs = lane.name === 'e2e' ? request.config.programs : {};

  if (lane.name === 'e2e') {
    const unprogrammed = collectUnprogrammedE2EDirs(e2eDirs, programs);

    if (unprogrammed.length > 0) {
      deps.output.err(formatUnprogrammedMessage(unprogrammed));

      return 2;
    }
  }

  const buildExitCode = await runProgramBuilds(programs, run, deps);

  if (buildExitCode !== 0) {
    return buildExitCode;
  }

  const hooks = await wireLaneHooks(lane, run, deps);
  const exitCode = await runLaneHooks(testArgs, withProgramEnvironment(hooks, run, programs));

  // A signal that arrives while the stop hook cleans up still fails the run.
  return pickExitCodeAfterTests(exitCode, run.signal.aborted);
}

function pickLaneTestArgs(
  config: RigConfig,
  lane: ResolvedLane,
  selection: Extract<TestSelection, { kind: 'files' | 'lane' }>,
  e2eDirs: readonly string[],
): readonly string[] {
  const timeoutArg = `--timeout=${lane.limitMs}`;

  return match(selection)
    .with({ kind: 'files' }, (files) => [timeoutArg, ...files.files, ...files.flags])
    .with({ kind: 'lane' }, (laneRun) => [
      timeoutArg,
      ...pickLaneSelection(lane, e2eDirs),
      ...pickOtherLaneIgnoreArgs(config, lane),
      ...laneRun.flags,
    ])
    .exhaustive();
}

// A folder selection takes every test file under it, so the e2e lane leaves out the files that
// belong to a lane with a suffix.
function pickOtherLaneIgnoreArgs(config: RigConfig, lane: ResolvedLane): readonly string[] {
  if (lane.suffix !== null) {
    return [];
  }

  return config.lanes.flatMap((other) =>
    other.suffix === null
      ? []
      : [`**/*${other.suffix}.test.ts`, `**/*${other.suffix}.test.tsx`].map(
          (pattern) => `--path-ignore-patterns=${pattern}`,
        ),
  );
}

function formatUnprogrammedMessage(directories: readonly string[]): string {
  return `rig: ${directories.join(', ')} has no program to run: declare the program in rig.config.ts programs, with the package it belongs to\n`;
}

function wireLaneHooks(lane: ResolvedLane, run: RigRun, deps: LaneDeps): Promise<LaneHooks> {
  if (lane.name === 'browser') {
    return deps.wireBrowserLaneHooks({
      repoRoot: run.repoRoot,
      runID: run.runID,
      memory: lane.memory,
      dietScript: deps.dietScript,
      environment: run.environment,
      signal: run.signal,
    });
  }

  if (lane.parallel === 'workers') {
    throw new Error(
      `the lane ${lane.name} runs in the worker count of the unit lane, which only unit may`,
    );
  }

  return Promise.resolve(
    makeRepoLaneHooks({
      context: { repoRoot: run.repoRoot, lane, runID: run.runID, environment: run.environment },
      dietScript: deps.dietScript,
      parallel: lane.parallel,
      signal: run.signal,
      importModule: deps.importModule,
      runCommand: deps.runCommand,
    }),
  );
}

// The programs' artifact paths reach the test process beside whatever the lane's own start hook
// adds.
function withProgramEnvironment(
  hooks: LaneHooks,
  run: RigRun,
  programs: Readonly<Record<string, ProgramDeclaration>>,
): LaneHooks {
  const programEnvironment = buildProgramEnvironment(run.repoRoot, programs);

  return {
    ...hooks,
    start: async () => {
      const started = await hooks.start();

      return started.kind === 'finish'
        ? started
        : { kind: 'proceed', environment: { ...started.environment, ...programEnvironment } };
    },
  };
}
