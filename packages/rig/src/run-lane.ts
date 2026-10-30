import type { BrowserLaneWiring } from './browser/wire-browser-lane-hooks.ts';
import type { LaneHooks } from './lane-hooks.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import { pickLaneSelection } from './pick-lane-selection.ts';
import type { CommandOptions } from './run-command.ts';
import { runLaneHooks } from './run-lane-hooks.ts';
import type { ResolvedLane, RigOutput, RigRun } from './types.ts';

export interface LaneDeps {
  readonly dietScript: string;

  readonly output: RigOutput;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly importModule: (path: string) => Promise<unknown>;

  readonly runCommand: (command: readonly string[], options: CommandOptions) => Promise<number>;

  readonly wireBrowserLaneHooks: (wiring: BrowserLaneWiring) => Promise<LaneHooks>;
}

// A lane runs its start hook, its tests under diet, and its stop hook, which runs even when the
// start or the tests fail.
export async function runLane(
  lane: ResolvedLane,
  extraArgs: readonly string[],
  run: RigRun,
  deps: LaneDeps,
): Promise<number> {
  const trackedFiles = lane.suffix === null ? await deps.readTrackedFiles(run.repoRoot) : [];
  const selection = pickLaneSelection(lane, pickE2EDirs(trackedFiles));

  if (selection.length === 0) {
    deps.output.out(`rig: the ${lane.name} lane has no tests\n`);

    return 0;
  }

  const hooks = await wireLaneHooks(lane, run, deps);

  return runLaneHooks([`--timeout=${lane.limitMs}`, ...selection, ...extraArgs], hooks);
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
