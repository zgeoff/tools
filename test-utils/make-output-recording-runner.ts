import type { RunCommand } from '../scripts/ci/run-command.ts';

export interface OutputRecordingRunner {
  readonly runCommand: RunCommand;

  // The stdout and then the stderr of each command, one entry per run.
  readonly outputs: string[];
}

// Wraps a command runner so a test reads what each command printed, as a logged runner prints it.
export function makeOutputRecordingRunner(run: RunCommand): OutputRecordingRunner {
  const outputs: string[] = [];

  const runCommand: RunCommand = async (argv, options) => {
    const result = await run(argv, options);

    outputs.push(`${result.stdout}${result.stderr}`);

    return result;
  };

  return { runCommand, outputs };
}
