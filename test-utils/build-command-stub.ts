import type { CommandResult, RunCommand } from '../scripts/ci/run-command.ts';

export interface CommandStub {
  // Answers each command whose argv equals one a test answered, runs any other command of the
  // pass-through program, and rejects the rest.
  readonly runCommand: RunCommand;

  // Sets the result for the exact argv; a later answer for the same argv replaces it.
  readonly answer: (argv: readonly string[], result: Readonly<CommandResult>) => void;

  readonly calls: readonly (readonly string[])[];
}

export interface CommandPassThrough {
  // The program, the first word of argv, whose commands run for real.
  readonly program: string;
  readonly runCommand: RunCommand;
}

export function buildCommandStub(passThrough?: Readonly<CommandPassThrough>): CommandStub {
  const answers = new Map<string, CommandResult>();

  const calls: (readonly string[])[] = [];

  const runCommand: RunCommand = (argv, options) => {
    calls.push([...argv]);

    const result = answers.get(JSON.stringify(argv));

    if (result === undefined && passThrough !== undefined && argv[0] === passThrough.program) {
      return passThrough.runCommand(argv, options);
    }

    if (result === undefined) {
      return Promise.reject(new Error(`the stub has no answer for: ${argv.join(' ')}`));
    }

    return Promise.resolve(result);
  };

  const answer = (argv: readonly string[], result: Readonly<CommandResult>) => {
    answers.set(JSON.stringify(argv), { ...result });
  };

  return { runCommand, answer, calls };
}
