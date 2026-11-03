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
      calls.push(`run ${String(context)}`);
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
