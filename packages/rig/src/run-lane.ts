import { match } from 'ts-pattern';
import { pickExitCodeAfterTests } from './browser/pick-exit-code-after-tests.ts';
import type { BrowserLaneWiring } from './browser/wire-browser-lane-hooks.ts';
import type { TestSelection } from './build-test-selection.ts';
import { buildTestSelection } from './build-test-selection.ts';
import { formatNoMatchMessage } from './format-no-match-message.ts';
import type { LaneHooks } from './lane-hooks.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
import { parseTestArgs } from './parse-test-args.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import { pickLaneSelection } from './pick-lane-selection.ts';
import type { CommandOptions } from './run-command.ts';
import { runLaneHooks } from './run-lane-hooks.ts';
import type { ResolvedLane, RigConfig, RigOutput, RigRun } from './types.ts';

export interface LaneDeps {
  readonly dietScript: string;

  readonly output: RigOutput;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly importModule: (path: string) => Promise<unknown>;

  readonly runCommand: (command: readonly string[], options: CommandOptions) => Promise<number>;

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
  const args = parseTestArgs(request.extraArgs);

  // A lane with a suffix and no paths needs no file list, so it runs outside a git repo too.
  const needsTrackedFiles = lane.suffix === null || args.paths.length > 0;
  const trackedFiles = needsTrackedFiles ? await deps.readTrackedFiles(run.repoRoot) : [];

  const selection = buildTestSelection({
    config: request.config,
    lane,
    repoRoot: run.repoRoot,
    trackedFiles,
    args,
  });

  if (selection.kind === 'none') {
    deps.output.err(formatNoMatchMessage(lane.name, selection.paths));

    return 1;
  }

  const testArgs = pickLaneTestArgs(request.config, lane, selection, trackedFiles);

  if (testArgs === null) {
    deps.output.out(`rig: the ${lane.name} lane has no tests\n`);

    return 0;
  }

  const hooks = await wireLaneHooks(lane, run, deps);
  const exitCode = await runLaneHooks(testArgs, hooks);

  // A signal that arrives while the stop hook cleans up still fails the run.
  return pickExitCodeAfterTests(exitCode, run.signal.aborted);
}

function pickLaneTestArgs(
  config: RigConfig,
  lane: ResolvedLane,
  selection: Exclude<TestSelection, { kind: 'none' }>,
  trackedFiles: readonly string[],
): readonly string[] | null {
  const timeoutArg = `--timeout=${lane.limitMs}`;

  return match(selection)
    .with({ kind: 'files' }, (files) => [timeoutArg, ...files.files, ...files.flags])
    .with({ kind: 'lane' }, (laneRun) => {
      const laneSelection = pickLaneSelection(lane, pickE2EDirs(trackedFiles));

      return laneSelection.length === 0
        ? null
        : [
            timeoutArg,
            ...laneSelection,
            ...pickOtherLaneIgnoreArgs(config, lane),
            ...laneRun.flags,
          ];
    })
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
