import { pickExitCodeAfterTests } from './browser/pick-exit-code-after-tests.ts';
import type { BrowserLaneWiring } from './browser/wire-browser-lane-hooks.ts';
import type { LaneHooks } from './lane-hooks.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
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
  const trackedFiles = lane.suffix === null ? await deps.readTrackedFiles(run.repoRoot) : [];
  const selection = pickLaneSelection(lane, pickE2EDirs(trackedFiles));

  if (selection.length === 0) {
    deps.output.out(`rig: the ${lane.name} lane has no tests\n`);

    return 0;
  }

  const hooks = await wireLaneHooks(lane, run, deps);

  const testArgs = [
    `--timeout=${lane.limitMs}`,
    ...selection,
    ...pickOtherLaneIgnoreArgs(request.config, lane),
    ...request.extraArgs,
  ];

  const exitCode = await runLaneHooks(testArgs, hooks);

  // A signal that arrives while the stop hook cleans up still fails the run.
  return pickExitCodeAfterTests(exitCode, run.signal.aborted);
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
