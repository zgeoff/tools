import { expect, test } from 'bun:test';
import { setImmediate } from 'node:timers/promises';
import { makeAnswerQueue } from '@zgeoff/testing/helpers';
import { buildSteppingClock } from '../test-utils/build-stepping-clock.ts';
import { defineBench } from './define-bench.ts';
import { runBenchmark } from './run-benchmark.ts';

test('it sets up once, warms up 5 times, measures 20 times and returns the median', async () => {
  const calls: string[] = [];
  let tick = 0;

  const definition = defineBench({
    name: 'boil',
    budget: '50ms',
    setup: () => {
      calls.push('setup');

      return Promise.resolve('kettle');
    },
    run: (context) => {
      calls.push(`run ${context}`);
    },
  });

  const result = await runBenchmark(definition, () => {
    tick += 3;

    return tick;
  });

  expect(calls.filter((call) => call === 'setup')).toHaveLength(1);
  expect(calls.filter((call) => call === 'run kettle')).toHaveLength(25);
  expect(calls[0]).toBe('setup');
  expect(result).toStrictEqual([{ concurrency: 1, medianMs: 3, spreadMs: 0 }]);
});

test('it keeps as many calls in flight at once as the level names', async () => {
  const inFlightAtStart: number[] = [];
  let inFlight = 0;

  const definition = defineBench({
    name: 'pour',
    budget: '50ms',
    concurrency: [4],
    run: async () => {
      inFlight += 1;

      inFlightAtStart.push(inFlight);

      await Promise.resolve();

      inFlight -= 1;
    },
  });

  await runBenchmark(definition, () => 0);

  expect({
    calls: inFlightAtStart.length,
    mostInFlight: Math.max(...inFlightAtStart),
  }).toStrictEqual({ calls: 100, mostInFlight: 4 });
});

test('it times each call of a round on its own and gives the median and spread per level', async () => {
  const clock = buildSteppingClock();

  const definition = defineBench({
    name: 'pour',
    budget: '50ms',
    concurrency: [1, 2],
    run: () => clock.sleep(2),
  });

  const result = await runBenchmark(definition, clock.now);

  expect(result).toStrictEqual([
    { concurrency: 1, medianMs: 2, spreadMs: 0 },
    { concurrency: 2, medianMs: 3, spreadMs: 2 },
  ]);
});

test('it times each synchronous call of a round apart from the calls after it', async () => {
  let tick = 0;

  const definition = defineBench({
    name: 'stir',
    budget: '50ms',
    concurrency: [4],
    run: () => {},
  });

  const result = await runBenchmark(definition, () => {
    tick += 1;

    return tick;
  });

  expect(result).toStrictEqual([{ concurrency: 4, medianMs: 1, spreadMs: 0 }]);
});

test('it disposes of the setup result once, after the measured runs', async () => {
  const calls: string[] = [];

  const definition = defineBench({
    name: 'boil',
    budget: '50ms',
    setup: () =>
      Promise.resolve({
        [Symbol.asyncDispose]: () => {
          calls.push('dispose');

          return Promise.resolve();
        },
      }),
    run: () => {
      calls.push('run');
    },
  });

  await runBenchmark(definition, () => 0);

  expect(calls).toHaveLength(26);
  expect(calls.at(-1)).toBe('dispose');
  expect(calls.filter((call) => call === 'dispose')).toHaveLength(1);
});

test('it sets up once and disposes once for every level', async () => {
  const calls: string[] = [];

  const definition = defineBench({
    name: 'pour',
    budget: '50ms',
    concurrency: [1, 2],
    setup: () => {
      calls.push('setup');

      return Promise.resolve({
        [Symbol.asyncDispose]: () => {
          calls.push('dispose');

          return Promise.resolve();
        },
      });
    },
    run: () => {
      calls.push('run');
    },
  });

  await runBenchmark(definition, () => 0);

  expect(calls).toStrictEqual(['setup', ...Array.from({ length: 75 }, () => 'run'), 'dispose']);
});

test('it disposes of the setup result when a run throws', async () => {
  const disposals: string[] = [];

  const definition = defineBench({
    name: 'boil',
    budget: '50ms',
    setup: () =>
      Promise.resolve({
        [Symbol.asyncDispose]: () => {
          disposals.push('dispose');

          return Promise.resolve();
        },
      }),
    run: () => {
      throw new Error('the kettle cracked');
    },
  });

  const running = runBenchmark(definition, () => 0);

  expect(running).rejects.toThrow('the kettle cracked');

  await Promise.allSettled([running]);

  expect(disposals).toStrictEqual(['dispose']);
});

test('it waits for every call of the round before it disposes of the setup result when a call rejects', async () => {
  const events: string[] = [];
  const slowCall = Promise.withResolvers<void>();

  const steps = makeAnswerQueue([
    () => Promise.reject(new Error('the kettle cracked')),
    async () => {
      await slowCall.promise;

      events.push('poured');
    },
  ]);

  const definition = defineBench({
    name: 'pour',
    budget: '50ms',
    concurrency: [2],
    setup: () =>
      Promise.resolve({
        [Symbol.asyncDispose]: () => {
          events.push('dispose');

          return Promise.resolve();
        },
      }),
    run: () => steps()(),
  });

  const running = runBenchmark(definition, () => 0);

  // A turn of the event loop lets a rejection that does not wait for the round reach the dispose.
  await setImmediate();

  slowCall.resolve();

  expect(running).rejects.toThrow('the kettle cracked');

  await Promise.allSettled([running]);

  expect(events).toStrictEqual(['poured', 'dispose']);
});

test('it disposes of a setup result that is a function with an async dispose', async () => {
  const disposals: string[] = [];

  const definition = defineBench({
    name: 'boil',
    budget: '50ms',
    setup: () =>
      Promise.resolve(
        Object.assign(() => {}, {
          [Symbol.asyncDispose]: () => {
            disposals.push('dispose');

            return Promise.resolve();
          },
        }),
      ),
    run: () => {},
  });

  await runBenchmark(definition, () => 0);

  expect(disposals).toStrictEqual(['dispose']);
});
