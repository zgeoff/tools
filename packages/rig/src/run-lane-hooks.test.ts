import { expect, mock, test } from 'bun:test';
import type { LaneHooks } from './lane-hooks.ts';
import { runLaneHooks } from './run-lane-hooks.ts';

function setupTest() {
  const calls: string[] = [];

  const hooks = {
    start: mock<LaneHooks['start']>(() => {
      calls.push('start');

      return Promise.resolve({
        kind: 'proceed',
        environment: { KILN_URL: 'http://localhost:7001' },
      });
    }),
    run: mock<LaneHooks['run']>(() => {
      calls.push('run');

      return Promise.resolve(0);
    }),
    stop: mock<LaneHooks['stop']>(() => {
      calls.push('stop');

      return Promise.resolve();
    }),
  };

  return { calls, hooks };
}

test('it starts, runs the tests with the environment that start returns, then stops', async () => {
  const ctx = setupTest();

  ctx.hooks.run.mockImplementation(() => {
    ctx.calls.push('run');

    return Promise.resolve(3);
  });

  const exitCode = await runLaneHooks(['--timeout=9000'], ctx.hooks);

  expect(exitCode).toBe(3);
  expect(ctx.calls).toStrictEqual(['start', 'run', 'stop']);

  expect(ctx.hooks.run).toHaveBeenCalledExactlyOnceWith(['--timeout=9000'], {
    KILN_URL: 'http://localhost:7001',
  });
});

test('it runs no tests, and still stops, when start finishes the run', async () => {
  const ctx = setupTest();

  ctx.hooks.start.mockImplementation(() => {
    ctx.calls.push('start');

    return Promise.resolve({ kind: 'finish', exitCode: 7 });
  });

  const exitCode = await runLaneHooks([], ctx.hooks);

  expect(exitCode).toBe(7);
  expect(ctx.calls).toStrictEqual(['start', 'stop']);
});

test('it stops when the tests fail to run', async () => {
  const ctx = setupTest();

  ctx.hooks.run.mockImplementation(() => {
    ctx.calls.push('run');

    return Promise.reject(new Error('the process group still runs'));
  });

  const failure = await runLaneHooks([], ctx.hooks).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);

  expect(failure).toHaveProperty(
    'message',
    expect.stringContaining('the process group still runs'),
  );

  expect(ctx.calls).toStrictEqual(['start', 'run', 'stop']);
});

test('it stops when start fails', async () => {
  const ctx = setupTest();

  ctx.hooks.start.mockImplementation(() => {
    ctx.calls.push('start');

    return Promise.reject(new Error('the kiln did not start'));
  });

  const failure = await runLaneHooks([], ctx.hooks).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);
  expect(failure).toHaveProperty('message', expect.stringContaining('the kiln did not start'));
  expect(ctx.calls).toStrictEqual(['start', 'stop']);
});

test('it keeps the start failure first, beside the stop failure, when both fail', async () => {
  const ctx = setupTest();

  const startFailure = new Error('the kiln did not start');
  const stopFailure = new Error('the kiln did not cool down');

  ctx.hooks.start.mockRejectedValue(startFailure);
  ctx.hooks.stop.mockRejectedValue(stopFailure);

  const failure = await runLaneHooks([], ctx.hooks).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).toHaveProperty('errors', [startFailure, stopFailure]);
});

test('it keeps the run failure first, beside the stop failure, when both fail', async () => {
  const ctx = setupTest();

  const runFailure = new Error('the process group still runs');
  const stopFailure = new Error('the kiln did not cool down');

  ctx.hooks.run.mockRejectedValue(runFailure);
  ctx.hooks.stop.mockRejectedValue(stopFailure);

  const failure = await runLaneHooks([], ctx.hooks).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).toHaveProperty('errors', [runFailure, stopFailure]);
});

test('it fails with the stop failure alone when the tests ran', async () => {
  const ctx = setupTest();

  const stopFailure = new Error('the kiln did not cool down');

  ctx.hooks.stop.mockRejectedValue(stopFailure);

  const failure = await runLaneHooks([], ctx.hooks).catch((error: unknown) => error);

  expect(failure).toBe(stopFailure);
});
