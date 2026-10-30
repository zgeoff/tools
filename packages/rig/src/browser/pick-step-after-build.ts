export type StepAfterBuild =
  | { readonly kind: 'run-tests' }
  | { readonly kind: 'finish'; readonly exitCode: number };

// A null exit code means the repo has no build. An aborted run starts no tests and fails, whatever
// the build's exit code.
export function pickStepAfterBuild(
  buildExitCode: number | null,
  isAborted: boolean,
): StepAfterBuild {
  if (isAborted) {
    return { kind: 'finish', exitCode: 1 };
  }

  if (buildExitCode !== null && buildExitCode !== 0) {
    return { kind: 'finish', exitCode: buildExitCode };
  }

  return { kind: 'run-tests' };
}
