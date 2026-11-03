import { expect, test } from 'bun:test';
import { defineBench } from './define-bench.ts';
import { formatBenchmarkResult } from './format-benchmark-result.ts';

test('it names the median and the budget and says when the median is over', () => {
  const definition = defineBench({ name: 'boil', budget: '50ms', run: () => {} });

  expect(formatBenchmarkResult(definition, { medianMs: 12.345 })).toBe(
    'bench boil: median 12.35ms, budget 50ms, within budget\n',
  );

  expect(formatBenchmarkResult(definition, { medianMs: 60 })).toBe(
    'bench boil: median 60.00ms, budget 50ms, over budget\n',
  );
});
