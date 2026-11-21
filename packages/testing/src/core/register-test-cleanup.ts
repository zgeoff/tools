import { onTestFinished } from 'bun:test';

export interface TestCleanupRegistry {
  readonly register: <T>(release: () => T) => () => T;
}

interface PendingRelease {
  hasRun: boolean;
  readonly run: () => unknown;
}

// Releases what a test made, after the test, last registered first. Every release runs, even after
// one throws, and the failures come out together as one AggregateError.
export function createTestCleanupRegistry(
  scheduleAfterTest: (hook: () => Promise<void>) => void,
): TestCleanupRegistry {
  let pending: PendingRelease[] | null = null;

  const runPending = async (): Promise<void> => {
    const releases = pending ?? [];
    const failures: unknown[] = [];

    pending = null;

    for (const release of releases.toReversed()) {
      if (release.hasRun) {
        continue;
      }

      try {
        await release.run();
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length} test cleanups failed`);
    }
  };

  const register = <T>(release: () => T): (() => T) => {
    const outcome: { result?: { readonly value: T } | { readonly error: unknown } } = {};

    const entry: PendingRelease = {
      hasRun: false,
      run: () => runOnce(),
    };

    const runOnce = (): T => {
      if (outcome.result === undefined) {
        entry.hasRun = true;

        try {
          outcome.result = { value: release() };
        } catch (error) {
          outcome.result = { error };
        }
      }

      if ('error' in outcome.result) {
        throw outcome.result.error;
      }

      return outcome.result.value;
    };

    if (pending === null) {
      pending = [];

      scheduleAfterTest(runPending);
    }

    pending.push(entry);

    return runOnce;
  };

  return { register };
}

const registry = createTestCleanupRegistry((hook) => {
  onTestFinished(hook);
});

// Runs release after the test, in reverse order of registration. The returned function runs it
// early, and the after-test run then skips it. A release runs at most once: a later call returns
// the first call's result. Call it inside a test or a beforeEach.
export const registerTestCleanup = registry.register;
