import { match } from 'ts-pattern';
import { findIsolateArgument } from './find-isolate-argument.ts';
import { findTimeoutArg } from './find-timeout-arg.ts';
import { commandNames, isCommandName } from './is-command-name.ts';
import { readCLIArgs } from './read-cli-args.ts';
import { runBench } from './run-bench.ts';
import type { BenchDeps } from './run-bench.ts';
import { runEval } from './run-eval.ts';
import type { EvalDeps } from './run-eval.ts';
import { runInit } from './run-init.ts';
import type { InitDeps } from './run-init.ts';
import type { LaneDeps } from './run-lane.ts';
import { runLane } from './run-lane.ts';
import type { RelatedTestDeps } from './run-related-tests.ts';
import { runRelatedTests } from './run-related-tests.ts';
import { runUnit } from './run-unit.ts';
import type { UnitDeps } from './run-unit.ts';
import type { RigConfig, RigRun } from './types.ts';

export interface CLIDeps
  extends LaneDeps, UnitDeps, RelatedTestDeps, InitDeps, BenchDeps, EvalDeps {
  readonly readConfig: (repoRoot: string) => Promise<RigConfig>;
}

export async function runCLI(argv: readonly string[], run: RigRun, deps: CLIDeps): Promise<number> {
  const args = await readCLIArgs(argv);

  if (typeof args === 'string') {
    deps.output.err(`rig: ${args}\n`);

    return 2;
  }

  const config = await deps.readConfig(run.repoRoot);

  const command = args.command;

  if (isCommandName(command)) {
    return match(command)
      .with('bench', () => runBench(args.extraArgs, config, run, deps))
      .with('eval', () => runEval(args.extraArgs, run, deps))
      .with('init', () => runInit(run.repoRoot, config, deps))
      .with('related', () => runRelatedTests(args.extraArgs, config, run, deps))
      .exhaustive();
  }

  const lane = config.lanes.find((candidate) => candidate.name === command);

  if (lane === undefined) {
    return reportUsage(config, deps, command);
  }

  // A forwarded timeout would override the lane's limit, and the pre-push timeout check reads only
  // `bun test` scripts, so a `rig <lane> --timeout=<n>` script would pass it unseen.
  const timeoutArg = findTimeoutArg(args.extraArgs);

  if (timeoutArg !== undefined) {
    deps.output.err(
      `rig: rig ${command} refuses ${timeoutArg}, because the lane limit lives in rig.config.ts\n`,
    );

    return 2;
  }

  const isolateArgument = findIsolateArgument(args.extraArgs);

  if (isolateArgument !== undefined) {
    deps.output.err(
      `rig: rig ${command} refuses ${isolateArgument}, because every lane runs its files in one global per process\n`,
    );

    return 2;
  }

  return lane.name === 'unit'
    ? runUnit(config, args.extraArgs, run, deps)
    : runLane({ config, lane, extraArgs: args.extraArgs }, run, deps);
}

function reportUsage(config: RigConfig, deps: CLIDeps, command: string): number {
  const names = [...commandNames, ...config.lanes.map((lane) => lane.name)].join(', ');

  deps.output.err(`rig: unknown command "${command}"; use one of ${names}\n`);

  return 2;
}
