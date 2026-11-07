import { match } from 'ts-pattern';
import { pickExitCodeAfterTests } from './browser/pick-exit-code-after-tests.ts';
import type { BrowserLaneWiring } from './browser/wire-browser-lane-hooks.ts';
import { buildProgramLaneHooks } from './build-program-lane-hooks.ts';
import type { TestSelection } from './build-test-selection.ts';
import { buildTestSelection } from './build-test-selection.ts';
import { collectUnprogrammedE2EDirs } from './collect-unprogrammed-e2e-dirs.ts';
import { formatNoMatchMessage } from './format-no-match-message.ts';
import { formatNoTestsMessage } from './format-no-tests-message.ts';
import { hasLaneSuffix } from './has-lane-suffix.ts';
import { isTestFile } from './is-test-file.ts';
import type { LaneHooks } from './lane-hooks.ts';
import { makeIgnoreCheck } from './make-ignore-check.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
import { parseTestArgs } from './parse-test-args.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import { pickLaneSelection } from './pick-lane-selection.ts';
import { runLaneHooks } from './run-lane-hooks.ts';
import type { ProgramBuildDeps } from './run-program-builds.ts';
import { runProgramBuilds } from './run-program-builds.ts';
import type { ResolvedLane, RigConfig, RigRun } from './types.ts';

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

  const e2eDirs = collectRunnableE2EDirs(
    pickE2EDirs(trackedFiles, isWorkspaceRepo),
    trackedFiles,
    request.config,
  );

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

  const exitCode = await runLaneHooks(
    testArgs,
    buildProgramLaneHooks(hooks, run.repoRoot, programs),
  );

  // A signal that arrives while the stop hook cleans up still fails the run.
  return pickExitCodeAfterTests(exitCode, run.signal.aborted);
}

function collectRunnableE2EDirs(
  e2eDirs: readonly string[],
  trackedFiles: readonly string[],
  config: RigConfig,
): readonly string[] {
  const isIgnored = makeIgnoreCheck(config.ignore);

  const isE2ETest = (file: string) =>
    isTestFile(file) &&
    !isIgnored(file) &&
    !config.lanes.some((lane) => lane.suffix !== null && hasLaneSuffix(file, lane.suffix));

  return e2eDirs.filter((directory) =>
    trackedFiles.some((file) => file.startsWith(`${directory}/`) && isE2ETest(file)),
  );
}

function pickLaneTestArgs(
  config: RigConfig,
  lane: ResolvedLane,
  selection: Extract<TestSelection, { kind: 'files' | 'lane' }>,
  e2eDirs: readonly string[],
): readonly string[] {
  const timeoutArg = `--timeout=${lane.limitMs}`;

  // bun test reads a bare argument as a name filter; the ./ makes it a path.
  return match(selection)
    .with({ kind: 'files' }, (files) => [
      timeoutArg,
      ...files.files.map((file) => `./${file}`),
      ...files.flags,
    ])
    .with({ kind: 'lane' }, (laneRun) => [
      timeoutArg,
      ...pickLaneSelection(lane, e2eDirs),
      ...pickLaneIgnoreArgs(config, lane),
      ...laneRun.flags,
    ])
    .exhaustive();
}

// A folder selection takes every test file under it, so the e2e lane leaves out the files that
// belong to a lane with a suffix. A --path-ignore-patterns argument replaces bunfig.toml's
// pathIgnorePatterns, so every lane passes the config's ignore list itself.
function pickLaneIgnoreArgs(config: RigConfig, lane: ResolvedLane): readonly string[] {
  const otherLanePatterns =
    lane.suffix === null
      ? config.lanes.flatMap((other) =>
          other.suffix === null
            ? []
            : [`**/*${other.suffix}.test.ts`, `**/*${other.suffix}.test.tsx`],
        )
      : [];

  return [...otherLanePatterns, ...config.ignore].map(
    (pattern) => `--path-ignore-patterns=${pattern}`,
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
