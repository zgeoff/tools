import { expect, test } from 'bun:test';
import { collectBenchComparison } from './collect-bench-comparison.ts';

test('it matches the entries on file, name and level, in head order, with base-only rows last', () => {
  const rows = collectBenchComparison(
    [
      {
        file: 'bench/steep.bench.ts',
        name: 'steep',
        concurrency: 1,
        medianMs: 8,
        spreadMs: 0.5,
        budgetMs: 20,
      },
      {
        file: 'bench/pour.bench.ts',
        name: 'pour',
        concurrency: 4,
        medianMs: 30.4,
        spreadMs: 2.1,
        budgetMs: 80,
      },
      {
        file: 'bench/pour.bench.ts',
        name: 'pour',
        concurrency: 1,
        medianMs: 12.1,
        spreadMs: 0.8,
        budgetMs: 80,
      },
    ],
    [
      {
        file: 'bench/pour.bench.ts',
        name: 'pour',
        concurrency: 1,
        medianMs: 11.5,
        spreadMs: 0.7,
        budgetMs: 80,
      },
      {
        file: 'bench/pour.bench.ts',
        name: 'pour',
        concurrency: 4,
        medianMs: 33.2,
        spreadMs: 2.4,
        budgetMs: 80,
      },
      {
        file: 'bench/boil.bench.ts',
        name: 'boil',
        concurrency: 1,
        medianMs: 5,
        spreadMs: 0.2,
        budgetMs: 10,
      },
    ],
  );

  expect(rows).toStrictEqual([
    {
      file: 'bench/pour.bench.ts',
      name: 'pour',
      concurrency: 1,
      base: { medianMs: 12.1, spreadMs: 0.8 },
      head: { medianMs: 11.5, spreadMs: 0.7 },
    },
    {
      file: 'bench/pour.bench.ts',
      name: 'pour',
      concurrency: 4,
      base: { medianMs: 30.4, spreadMs: 2.1 },
      head: { medianMs: 33.2, spreadMs: 2.4 },
    },
    {
      file: 'bench/boil.bench.ts',
      name: 'boil',
      concurrency: 1,
      base: null,
      head: { medianMs: 5, spreadMs: 0.2 },
    },
    {
      file: 'bench/steep.bench.ts',
      name: 'steep',
      concurrency: 1,
      base: { medianMs: 8, spreadMs: 0.5 },
      head: null,
    },
  ]);
});

test('it keeps apart two bench files that define a benchmark of the same name', () => {
  const rows = collectBenchComparison(
    [
      {
        file: 'packages/teapot/bench/pour.bench.ts',
        name: 'pour',
        concurrency: 1,
        medianMs: 12,
        spreadMs: 0.5,
        budgetMs: 80,
      },
      {
        file: 'packages/kettle/bench/pour.bench.ts',
        name: 'pour',
        concurrency: 1,
        medianMs: 40,
        spreadMs: 2,
        budgetMs: 80,
      },
    ],
    [
      {
        file: 'packages/kettle/bench/pour.bench.ts',
        name: 'pour',
        concurrency: 1,
        medianMs: 44,
        spreadMs: 3,
        budgetMs: 80,
      },
      {
        file: 'packages/teapot/bench/pour.bench.ts',
        name: 'pour',
        concurrency: 1,
        medianMs: 11,
        spreadMs: 0.4,
        budgetMs: 80,
      },
    ],
  );

  expect(rows).toStrictEqual([
    {
      file: 'packages/kettle/bench/pour.bench.ts',
      name: 'pour',
      concurrency: 1,
      base: { medianMs: 40, spreadMs: 2 },
      head: { medianMs: 44, spreadMs: 3 },
    },
    {
      file: 'packages/teapot/bench/pour.bench.ts',
      name: 'pour',
      concurrency: 1,
      base: { medianMs: 12, spreadMs: 0.5 },
      head: { medianMs: 11, spreadMs: 0.4 },
    },
  ]);
});

test('it gives no rows when neither side has an entry', () => {
  expect(collectBenchComparison([], [])).toStrictEqual([]);
});
