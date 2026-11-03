import { mock } from 'bun:test';

// A stand-in that records each call, reports its first call, and settles every call with the value
// only once the test releases it, so a test can act while a caller is inside it.
export function createBlockingStubKit<Value>(value: Value) {
  const firstCall = Promise.withResolvers<readonly unknown[]>();
  const released = Promise.withResolvers<void>();

  const stub = mock(async (...callArguments: readonly unknown[]): Promise<Value> => {
    firstCall.resolve(callArguments);

    await released.promise;

    return value;
  });

  return {
    stub,
    firstCall: firstCall.promise,
    release: () => {
      released.resolve();
    },
  };
}
