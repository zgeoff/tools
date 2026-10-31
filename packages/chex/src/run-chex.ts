import { match } from 'ts-pattern';
import type { CheckName } from './check-names.ts';
import { chexUsage, parseChexArgs } from './parse-chex-args.ts';

export interface ChexDeps {
  readonly runCheck: (name: CheckName, args: readonly string[]) => Promise<number>;
  readonly runInit: () => Promise<number>;
  readonly writeOutput: (text: string) => void;
  readonly writeError: (text: string) => void;
}

// Runs every named check, even after one bounces, so the output names each check that fails.
// Returns the highest exit code of the checks, and 2 for a refused request.
export function runChex(argv: readonly string[], deps: ChexDeps): Promise<number> {
  return match(parseChexArgs(argv))
    .with({ kind: 'refused' }, (refusal) => {
      deps.writeError(`chex: ${refusal.message}\n${chexUsage}\n`);

      return Promise.resolve(2);
    })
    .with({ kind: 'init' }, () => deps.runInit())
    .with({ kind: 'checks' }, (request) => runChecks(request.names, request.args, deps))
    .exhaustive();
}

async function runChecks(
  names: readonly CheckName[],
  args: readonly string[],
  deps: ChexDeps,
): Promise<number> {
  let exitCode = 0;

  for (const name of names) {
    const checkExitCode = await runOneCheck(name, args, deps);

    deps.writeOutput(`${checkExitCode === 0 ? 'cleared' : 'bounced'}: ${name}\n`);

    exitCode = Math.max(exitCode, checkExitCode);
  }

  return exitCode;
}

// A check that throws, such as a shell script on a host without bash, cannot run, and so does a
// script that exits with a shell's own code, such as 127 for a missing perl: each counts as exit 2.
async function runOneCheck(
  name: CheckName,
  args: readonly string[],
  deps: ChexDeps,
): Promise<number> {
  try {
    const exitCode = await deps.runCheck(name, args);

    return exitCode === 0 || exitCode === 1 ? exitCode : 2;
  } catch (error) {
    deps.writeError(
      `chex: ${name} cannot run: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 2;
  }
}
