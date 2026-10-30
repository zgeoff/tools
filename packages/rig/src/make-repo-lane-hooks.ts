import { join } from 'node:path';
import { buildDietCommand } from './build-diet-command.ts';
import type { LaneHooks } from './lane-hooks.ts';
import { parseLaneHook } from './parse-lane-hook.ts';
import { parseLaneStart } from './parse-lane-start.ts';
import type { CommandOptions } from './run-command.ts';
import type { LaneContext } from './types.ts';

export interface RepoLaneOptions {
  readonly context: LaneContext;

  readonly dietScript: string;

  readonly parallel: number;

  readonly signal: AbortSignal;

  readonly importModule: (path: string) => Promise<unknown>;

  readonly runCommand: (command: readonly string[], options: CommandOptions) => Promise<number>;
}

// The hooks of a lane that a repo declares: its start and stop modules around `bun test` under
// diet. A lane with no module for a hook skips that hook.
export function makeRepoLaneHooks(options: RepoLaneOptions): LaneHooks {
  const lane = options.context.lane;

  return {
    start: async () => {
      if (lane.start === null) {
        return { kind: 'proceed', environment: options.context.environment };
      }

      const started = await runHook(lane.start, options);

      return {
        kind: 'proceed',
        environment: {
          ...options.context.environment,
          ...parseLaneStart(started, lane.start).environment,
        },
      };
    },
    run: (testArgs, environment) =>
      options.runCommand(
        buildDietCommand(options.dietScript, lane.memory, [
          'bun',
          'test',
          `--parallel=${options.parallel}`,
          ...testArgs,
        ]),
        { cwd: options.context.repoRoot, environment, signal: options.signal },
      ),
    stop: async () => {
      if (lane.stop !== null) {
        await runHook(lane.stop, options);
      }
    },
  };
}

async function runHook(path: string, options: RepoLaneOptions): Promise<unknown> {
  const absolutePath = join(options.context.repoRoot, path);

  const loaded = await options.importModule(absolutePath);

  const hook = parseLaneHook(loaded, path);

  return hook(options.context);
}
