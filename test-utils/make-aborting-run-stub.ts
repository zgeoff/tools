import { mock } from 'bun:test';

// A stand-in for the lane's test run that aborts the controller, then exits with the code, so the
// abort arrives as the tests exit.
export function makeAbortingRunStub(controller: AbortController, exitCode: number) {
  return mock<(...callArguments: readonly unknown[]) => Promise<number>>(() => {
    controller.abort();

    return Promise.resolve(exitCode);
  });
}
