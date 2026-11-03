import { expect, test } from 'bun:test';
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
  expect(result.medianMs).toBe(3);
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

  await expect(runBenchmark(definition, () => 0)).rejects.toThrow('the kettle cracked');

  expect(disposals).toStrictEqual(['dispose']);
});
