import type { ProgramResult, RunProgram } from '../sync/pre-push/run-program.ts';
import { runProgram } from '../sync/pre-push/run-program.ts';

export interface StubCommitlint {
  readonly runProgram: RunProgram;
  readonly readMessages: () => readonly string[];
}

export function buildStubCommitlint(
  commitlint: string,
  results: readonly ProgramResult[],
): StubCommitlint {
  const messages: string[] = [];

  return {
    runProgram: (argv, options) => {
      if (argv[0] !== commitlint) {
        return runProgram(argv, options);
      }

      const result = results[messages.length];

      if (result === undefined) {
        throw new Error(`commitlint was called ${messages.length + 1} times, past the last answer`);
      }

      messages.push(options.stdin ?? '');

      return result;
    },
    readMessages: () => [...messages],
  };
}
