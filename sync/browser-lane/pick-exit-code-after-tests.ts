// A leader can exit 0 before an abort reaches it, while the lane still stops the processes it left,
// so an aborted run fails whatever the tests' exit code.
export function pickExitCodeAfterTests(testsExitCode: number, isAborted: boolean): number {
  return isAborted ? 1 : testsExitCode;
}
