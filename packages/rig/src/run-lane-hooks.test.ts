import { expect, test } from 'bun:test';
import { makeRejectingStub } from '../../../test-utils/make-rejecting-stub.ts';
import { makeResolvingStub } from '../../../test-utils/make-resolving-stub.ts';
import type { LaneStartOutcome } from './lane-hooks.ts';
import { runLaneHooks } from './run-lane-hooks.ts';

test('it starts, runs the tests with the environment that start returns, then stops', async () => {
  const hooks = {
    start: makeResolvingStub<LaneStartOutcome>({
      kind: 'proceed',
      environment: { KILN_URL: 'http://localhost:7001' },
    }),
    run: makeResolvingStub(3),
    stop: makeResolvingStub(undefined),
  };

  const exitCode = await runLaneHooks(['--timeout=9000'], hooks);

  expect(exitCode).toBe(3);
  expect(hooks.start).toHaveBeenCalledBefore(hooks.run);
  expect(hooks.run).toHaveBeenCalledBefore(hooks.stop);

  expect(hooks.run).toHaveBeenCalledExactlyOnceWith(['--timeout=9000'], {
    KILN_URL: 'http://localhost:7001',
  });
});

test('it runs no tests, and still stops, when start finishes the run', async () => {
  const hooks = {
    start: makeResolvingStub<LaneStartOutcome>({ kind: 'finish', exitCode: 7 }),
    run: makeResolvingStub(0),
    stop: makeResolvingStub(undefined),
  };

  const exitCode = await runLaneHooks([], hooks);

  expect(exitCode).toBe(7);
  expect(hooks.run).not.toHaveBeenCalled();
  expect(hooks.start).toHaveBeenCalledBefore(hooks.stop);
});

test('it stops when the tests fail to run', async () => {
  const runFailure = new Error('the process group still runs');

  const hooks = {
    start: makeResolvingStub<LaneStartOutcome>({ kind: 'proceed', environment: {} }),
    run: makeRejectingStub(runFailure),
    stop: makeResolvingStub(undefined),
  };

  const failure = await runLaneHooks([], hooks).catch((error: unknown) => error);

  expect(failure).toBe(runFailure);
  expect(hooks.run).toHaveBeenCalledBefore(hooks.stop);
});

test('it stops when start fails', async () => {
  const startFailure = new Error('the kiln did not start');

  const hooks = {
    start: makeRejectingStub(startFailure),
    run: makeResolvingStub(0),
    stop: makeResolvingStub(undefined),
  };

  const failure = await runLaneHooks([], hooks).catch((error: unknown) => error);

  expect(failure).toBe(startFailure);
  expect(hooks.run).not.toHaveBeenCalled();
  expect(hooks.start).toHaveBeenCalledBefore(hooks.stop);
});

test('it keeps the start failure first, beside the stop failure, when both fail', async () => {
  const startFailure = new Error('the kiln did not start');
  const stopFailure = new Error('the kiln did not cool down');

  const hooks = {
    start: makeRejectingStub(startFailure),
    run: makeResolvingStub(0),
    stop: makeRejectingStub(stopFailure),
  };

  const failure = await runLaneHooks([], hooks).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).toHaveProperty('errors', [startFailure, stopFailure]);
});

test('it keeps the run failure first, beside the stop failure, when both fail', async () => {
  const runFailure = new Error('the process group still runs');
  const stopFailure = new Error('the kiln did not cool down');

  const hooks = {
    start: makeResolvingStub<LaneStartOutcome>({ kind: 'proceed', environment: {} }),
    run: makeRejectingStub(runFailure),
    stop: makeRejectingStub(stopFailure),
  };

  const failure = await runLaneHooks([], hooks).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).toHaveProperty('errors', [runFailure, stopFailure]);
});

test('it reports the failed exit first, beside the stop failure, when the tests fail and stop fails', async () => {
  const stopFailure = new Error('the kiln did not cool down');

  const hooks = {
    start: makeResolvingStub<LaneStartOutcome>({ kind: 'proceed', environment: {} }),
    run: makeResolvingStub(1),
    stop: makeRejectingStub(stopFailure),
  };

  const failure = await runLaneHooks([], hooks).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).toHaveProperty('errors', [new Error('the lane exited with code 1'), stopFailure]);
});

test('it reports the exit code that start finishes with, beside the stop failure, when stop fails', async () => {
  const stopFailure = new Error('the kiln did not cool down');

  const hooks = {
    start: makeResolvingStub<LaneStartOutcome>({ kind: 'finish', exitCode: 7 }),
    run: makeResolvingStub(0),
    stop: makeRejectingStub(stopFailure),
  };

  const failure = await runLaneHooks([], hooks).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).toHaveProperty('errors', [new Error('the lane exited with code 7'), stopFailure]);
});

test('it fails with the stop failure alone when the tests passed', async () => {
  const stopFailure = new Error('the kiln did not cool down');

  const hooks = {
    start: makeResolvingStub<LaneStartOutcome>({ kind: 'proceed', environment: {} }),
    run: makeResolvingStub(0),
    stop: makeRejectingStub(stopFailure),
  };

  const failure = await runLaneHooks([], hooks).catch((error: unknown) => error);

  expect(failure).toBe(stopFailure);
});
