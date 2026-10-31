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
export async function runChex(argv: readonly string[], deps: ChexDeps): Promise<number> {
  const request = parseChexArgs(argv);

  if (request.kind === 'refused') {
    deps.writeError(`chex: ${request.message}\n${chexUsage}\n`);

    return 2;
  }

  if (request.kind === 'init') {
    return deps.runInit();
  }

  let exitCode = 0;

  for (const name of request.names) {
    const checkExitCode = await runOneCheck(name, request.args, deps);

    deps.writeOutput(`${checkExitCode === 0 ? 'cleared' : 'bounced'}: ${name}\n`);

    exitCode = Math.max(exitCode, checkExitCode);
  }

  return exitCode;
}

// A check that throws, such as a shell script on a host without bash, cannot run, so it counts as
// exit 2 and the checks after it still run.
async function runOneCheck(
  name: CheckName,
  args: readonly string[],
  deps: ChexDeps,
): Promise<number> {
  try {
    return await deps.runCheck(name, args);
  } catch (error) {
    deps.writeError(
      `chex: ${name} cannot run: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 2;
  }
}
