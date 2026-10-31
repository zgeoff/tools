import invariant from 'tiny-invariant';

export interface CommandCall {
  readonly command: readonly string[];

  readonly cwd: string;
}

export interface StubCommandRunner {
  readonly runCommand: (command: readonly string[], cwd: string) => Promise<void>;

  readonly calls: readonly CommandCall[];
}

// Stands in for a command runner that only succeeds or fails: it answers each command by its argv
// joined with spaces, null for a success and a message for a failure, records each call, and fails
// a test on a command the test gave no answer for.
export function buildStubCommandRunner(
  answers: Readonly<Record<string, string | null>>,
): StubCommandRunner {
  const calls: CommandCall[] = [];

  return {
    calls,
    runCommand: (command, cwd) => {
      calls.push({ command, cwd });

      const key = command.join(' ');
      const answer = answers[key];

      invariant(answer !== undefined, `the stub command runner has no answer for ${key}`);

      return answer === null ? Promise.resolve() : Promise.reject(new Error(answer));
    },
  };
}
