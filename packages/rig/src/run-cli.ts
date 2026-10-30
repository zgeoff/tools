import { match } from 'ts-pattern';
import { readCLIArgs } from './read-cli-args.ts';
import { runInit } from './run-init.ts';
import type { InitDeps } from './run-init.ts';
import type { LaneDeps } from './run-lane.ts';
import { runLane } from './run-lane.ts';
import type { RelatedTestDeps } from './run-related-tests.ts';
import { runRelatedTests } from './run-related-tests.ts';
import { runUnit } from './run-unit.ts';
import type { UnitDeps } from './run-unit.ts';
import type { RigConfig, RigRun } from './types.ts';

export interface CLIDeps extends LaneDeps, UnitDeps, RelatedTestDeps, InitDeps {
  readonly readConfig: (repoRoot: string) => Promise<RigConfig>;
}

export async function runCLI(argv: readonly string[], run: RigRun, deps: CLIDeps): Promise<number> {
  const args = await readCLIArgs(argv);

  if (typeof args === 'string') {
    deps.output.err(`rig: ${args}\n`);

    return 2;
  }

  const config = await deps.readConfig(run.repoRoot);

  return match(args.command)
    .with('init', () => runInit(run.repoRoot, config, deps))
    .with('unit', () => runUnit(config, args.extraArgs, run, deps))
    .with('related', () => runRelatedTests(args.extraArgs, config, run, deps))
    .otherwise((command) => {
      const lane = config.lanes.find((candidate) => candidate.name === command);

      return lane === undefined
        ? reportUsage(config, deps, command)
        : runLane(lane, args.extraArgs, run, deps);
    });
}

function reportUsage(config: RigConfig, deps: CLIDeps, command?: string): number {
  const lanes = config.lanes.map((lane) => lane.name).join(', ');
  const unknown = command === undefined ? '' : `unknown command "${command}"; `;

  deps.output.err(`rig: ${unknown}use one of init, related, ${lanes}\n`);

  return 2;
}
