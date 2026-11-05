import { mock } from 'bun:test';
import { P, match } from 'ts-pattern';
import type { CommandOutput, ReadCommandOutput } from '../read-command-output.ts';
import type { CommandOptions } from '../run-command.ts';

// An exit code, or an exit code that the run gives after it aborts the controller, so the abort
// arrives while the command runs.
export type ExitCodeAnswer =
  | number
  | { readonly exitCode: number; readonly abort: AbortController };

export interface CommandAnswers {
  // The exit code of each run, in call order. A run past the last answer exits 0.
  readonly exitCodes: readonly ExitCodeAnswer[];

  // The output of each read, keyed by its argv joined with spaces. A read of any other command
  // exits 127, as a shell does for a command it cannot find.
  readonly outputs: Readonly<Record<string, CommandOutput>>;
}

// Stands in for a command runner and a command output reader that answer from the test's data,
// and record each call.
export function buildStubCommandAnswers(answers: CommandAnswers) {
  const runs = { count: 0 };

  return {
    runCommand: mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
      () => {
        const answer = answers.exitCodes[runs.count] ?? 0;

        runs.count += 1;

        return Promise.resolve(
          match(answer)
            .with(P.number, (exitCode) => exitCode)
            .with({ abort: P.any }, (aborting) => {
              aborting.abort.abort();

              return aborting.exitCode;
            })
            .exhaustive(),
        );
      },
    ),
    readCommandOutput: mock<ReadCommandOutput>((command) =>
      Promise.resolve(answers.outputs[command.join(' ')] ?? { exitCode: 127, stdout: '' }),
    ),
  };
}
