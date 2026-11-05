import { expect, test } from 'bun:test';
import { defineBench } from './define-bench.ts';
import { formatBenchmarkResult } from './format-benchmark-result.ts';

test('it prints a line per level with the median, the spread, the budget and the verdict', () => {
  const definition = defineBench({ name: 'boil', budget: '50ms', run: () => {} });

  expect(
    formatBenchmarkResult(definition, [
      { concurrency: 1, medianMs: 12.345, spreadMs: 1.2 },
      { concurrency: 4, medianMs: 60, spreadMs: 3.456 },
    ]),
  ).toBe(
    'bench boil at concurrency 1: median 12.35ms, spread 1.20ms, budget 50ms, within budget\n' +
      'bench boil at concurrency 4: median 60.00ms, spread 3.46ms, budget 50ms, over budget\n',
  );
});
