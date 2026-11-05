import { expect, test } from 'bun:test';
import { defineBench } from './define-bench.ts';
import { formatBenchReport } from './format-bench-report.ts';

test('it writes one JSON line per level with the bench file, each ending in a newline', () => {
  const definition = defineBench({ name: 'steep', budget: '40ms', run: () => {} });

  expect(
    formatBenchReport('/teapot/bench/steep.bench.ts', definition, [
      { concurrency: 1, medianMs: 11.5, spreadMs: 0.7 },
      { concurrency: 4, medianMs: 33.2, spreadMs: 2.4 },
    ]),
  ).toBe(
    '{"file":"/teapot/bench/steep.bench.ts","name":"steep","concurrency":1,"medianMs":11.5,"spreadMs":0.7,"budgetMs":40}\n' +
      '{"file":"/teapot/bench/steep.bench.ts","name":"steep","concurrency":4,"medianMs":33.2,"spreadMs":2.4,"budgetMs":40}\n',
  );
});
