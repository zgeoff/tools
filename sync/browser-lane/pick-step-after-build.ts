export type StepAfterBuild =
  | { readonly kind: 'run-tests' }
  | { readonly kind: 'finish'; readonly exitCode: number };

// A null exit code means the repo has no build.
export function pickStepAfterBuild(buildExitCode: number | null): StepAfterBuild {
  if (buildExitCode !== null && buildExitCode !== 0) {
    return { kind: 'finish', exitCode: buildExitCode };
  }

  return { kind: 'run-tests' };
}
