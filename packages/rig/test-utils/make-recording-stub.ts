import { mock } from 'bun:test';

// A stand-in that records each call and returns nothing, whatever its arguments.
export function makeRecordingStub() {
  return mock<(...callArguments: readonly unknown[]) => void>(() => {});
}
