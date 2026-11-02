import invariant from 'tiny-invariant';

export interface StubCheckRunner {
  // Each call as the check name and its arguments, joined by spaces.
  readonly calls: string[];

  readonly runCheck: (name: string, args: readonly string[]) => Promise<number>;
}

// Stands in for the function that runs one chex check: it answers each check with the exit code the
// test gives, or rejects with the error the test gives, as a check that cannot start throws.
export function buildStubCheckRunner(
  answers: Readonly<Record<string, number | Error>>,
): StubCheckRunner {
  const calls: string[] = [];

  const runCheck = (name: string, args: readonly string[]) => {
    calls.push([name, ...args].join(' '));

    const answer = answers[name];

    invariant(answer !== undefined, `the stub check runner has no answer for ${name}`);

    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };

  return { calls, runCheck };
}
