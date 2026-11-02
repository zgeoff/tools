import { mock } from 'bun:test';

// A stand-in that records each call and rejects with the failure, whatever its arguments.
export function makeRejectingStub(failure: Error) {
  return mock<(...callArguments: readonly unknown[]) => Promise<never>>(() =>
    Promise.reject(failure),
  );
}
