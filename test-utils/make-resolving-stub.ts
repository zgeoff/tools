import { mock } from 'bun:test';

// A stand-in that records each call and resolves with the value, whatever its arguments.
export function makeResolvingStub<Value>(value: Value) {
  return mock<(...callArguments: readonly unknown[]) => Promise<Value>>(() =>
    Promise.resolve(value),
  );
}
