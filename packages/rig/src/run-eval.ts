import { basename, dirname } from 'node:path';
import { collectEvalFiles } from './collect-eval-files.ts';
import type { CommandOptions } from './run-command.ts';
import type { RigOutput, RigRun } from './types.ts';

export interface EvalDeps {
  readonly output: RigOutput;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly runCommand: (command: readonly string[], options: CommandOptions) => Promise<number>;
}

// Runs each evaluation script with bun from the repo root, one after another, and fails when any
// one fails.
export async function runEval(
  args: readonly string[],
  run: RigRun,
  deps: EvalDeps,
): Promise<number> {
  if (args.length > 1) {
    deps.output.err('rig eval: takes at most one evaluation name\n');

    return 2;
  }

  const trackedFiles = await deps.readTrackedFiles(run.repoRoot);

  const evalFiles = collectEvalFiles(trackedFiles);
  const [name] = args;

  const files =
    name === undefined ? evalFiles : evalFiles.filter((file) => toEvalName(file) === name);

  if (files.length === 0) {
    return reportNoEval(name, evalFiles, deps);
  }

  let exitCode = 0;

  for (const file of files) {
    const fileExitCode = await deps.runCommand(['bun', file], {
      cwd: run.repoRoot,
      environment: run.environment,
      signal: run.signal,
    });

    exitCode = fileExitCode === 0 ? exitCode : 1;
  }

  return run.signal.aborted ? 1 : exitCode;
}

function toEvalName(file: string): string {
  return basename(dirname(file));
}

function reportNoEval(
  name: string | undefined,
  evalFiles: readonly string[],
  deps: EvalDeps,
): number {
  if (name === undefined) {
    deps.output.out('rig: the repo has no evaluations\n');

    return 0;
  }

  const names = evalFiles.map((file) => toEvalName(file)).join(', ');

  deps.output.err(`rig eval: no evaluation named "${name}"; the evaluations are ${names}\n`);

  return 1;
}
