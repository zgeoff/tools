import type { CommandOptions, CommandResult, RunCommand } from './run-command.ts';

class CommandError extends Error {
  readonly result: CommandResult;

  constructor(argv: readonly string[], result: CommandResult) {
    super(`${argv.join(' ')} exited with ${result.exitCode}: ${result.stderr.trim()}`);

    this.name = 'CommandError';
    this.result = result;
  }
}

// For a command whose failure fails the step: returns its result only when it exits 0.
export async function runCheckedCommand(
  runCommandWith: RunCommand,
  argv: readonly string[],
  options: Readonly<CommandOptions>,
): Promise<CommandResult> {
  const result = await runCommandWith(argv, options);

  if (result.exitCode !== 0) {
    throw new CommandError(argv, result);
  }

  return result;
}
