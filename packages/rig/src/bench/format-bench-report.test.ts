import { expect, test } from 'bun:test';
import { defineBench } from './define-bench.ts';
import { formatBenchReport } from './format-bench-report.ts';

test('it writes one JSON line per level, each ending in a newline', () => {
  const definition = defineBench({ name: 'steep', budget: '40ms', run: () => {} });

  expect(
    formatBenchReport(definition, [
      { concurrency: 1, medianMs: 11.5, spreadMs: 0.7 },
      { concurrency: 4, medianMs: 33.2, spreadMs: 2.4 },
    ]),
  ).toBe(
    '{"name":"steep","concurrency":1,"medianMs":11.5,"spreadMs":0.7,"budgetMs":40}\n' +
      '{"name":"steep","concurrency":4,"medianMs":33.2,"spreadMs":2.4,"budgetMs":40}\n',
  );
});
