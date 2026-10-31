import invariant from 'tiny-invariant';
import type { ProgramResult, RunProgram } from '../packages/chex/src/run-program.ts';

// Stands in for the synchronous program runner of the chex checks: it answers each command by its
// argv joined with spaces, and fails a test on a command the test gave no answer for.
export function buildStubProgramRunner(
  answers: Readonly<Record<string, ProgramResult>>,
): RunProgram {
  return (argv) => {
    const answer = answers[argv.join(' ')];

    invariant(answer !== undefined, `the stub program runner has no answer for ${argv.join(' ')}`);

    return answer;
  };
}
