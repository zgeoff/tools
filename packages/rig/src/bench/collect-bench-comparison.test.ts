import { expect, test } from 'bun:test';
import { collectBenchComparison } from './collect-bench-comparison.ts';

test('it matches the entries on name and level, in head order, with base-only rows last', () => {
  const rows = collectBenchComparison(
    [
      { name: 'steep', concurrency: 1, medianMs: 8, spreadMs: 0.5, budgetMs: 20 },
      { name: 'pour', concurrency: 4, medianMs: 30.4, spreadMs: 2.1, budgetMs: 80 },
      { name: 'pour', concurrency: 1, medianMs: 12.1, spreadMs: 0.8, budgetMs: 80 },
    ],
    [
      { name: 'pour', concurrency: 1, medianMs: 11.5, spreadMs: 0.7, budgetMs: 80 },
      { name: 'pour', concurrency: 4, medianMs: 33.2, spreadMs: 2.4, budgetMs: 80 },
      { name: 'boil', concurrency: 1, medianMs: 5, spreadMs: 0.2, budgetMs: 10 },
    ],
  );

  expect(rows).toStrictEqual([
    {
      name: 'pour',
      concurrency: 1,
      base: { medianMs: 12.1, spreadMs: 0.8 },
      head: { medianMs: 11.5, spreadMs: 0.7 },
    },
    {
      name: 'pour',
      concurrency: 4,
      base: { medianMs: 30.4, spreadMs: 2.1 },
      head: { medianMs: 33.2, spreadMs: 2.4 },
    },
    { name: 'boil', concurrency: 1, base: null, head: { medianMs: 5, spreadMs: 0.2 } },
    { name: 'steep', concurrency: 1, base: { medianMs: 8, spreadMs: 0.5 }, head: null },
  ]);
});

test('it gives no rows when neither side has an entry', () => {
  expect(collectBenchComparison([], [])).toStrictEqual([]);
});
