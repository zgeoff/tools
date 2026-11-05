import { expect, test } from 'bun:test';
import { formatBenchComparison } from './format-bench-comparison.ts';

test('it pads each column to its widest cell and shows the change of the median', () => {
  const table = formatBenchComparison([
    {
      file: 'bench/pour.bench.ts',
      name: 'pour one cup',
      concurrency: 1,
      base: { medianMs: 12.1, spreadMs: 0.8 },
      head: { medianMs: 11.5, spreadMs: 0.7 },
    },
    {
      file: 'bench/pour.bench.ts',
      name: 'pour one cup',
      concurrency: 4,
      base: { medianMs: 30.4, spreadMs: 2.1 },
      head: { medianMs: 33.2, spreadMs: 2.4 },
    },
  ]);

  expect(table).toBe(
    'bench         concurrency  base median  base spread  head median  head spread  change\n' +
      'pour one cup  1            12.10ms      0.80ms       11.50ms      0.70ms       -5.0%\n' +
      'pour one cup  4            30.40ms      2.10ms       33.20ms      2.40ms       +9.2%\n',
  );
});

test('it shows a dash for a missing side and its change', () => {
  const table = formatBenchComparison([
    {
      file: 'bench/boil.bench.ts',
      name: 'boil',
      concurrency: 16,
      base: null,
      head: { medianMs: 5, spreadMs: 0.25 },
    },
    {
      file: 'bench/steep.bench.ts',
      name: 'steep',
      concurrency: 1,
      base: { medianMs: 8, spreadMs: 0.5 },
      head: null,
    },
  ]);

  expect(table).toBe(
    'bench  concurrency  base median  base spread  head median  head spread  change\n' +
      'boil   16           -            -            5.00ms       0.25ms       -\n' +
      'steep  1            8.00ms       0.50ms       -            -            -\n',
  );
});

test('it signs an unchanged median with a plus', () => {
  const table = formatBenchComparison([
    {
      file: 'bench/boil.bench.ts',
      name: 'boil',
      concurrency: 1,
      base: { medianMs: 5, spreadMs: 0.25 },
      head: { medianMs: 5, spreadMs: 0.25 },
    },
  ]);

  expect(table).toBe(
    'bench  concurrency  base median  base spread  head median  head spread  change\n' +
      'boil   1            5.00ms       0.25ms       5.00ms       0.25ms       +0.0%\n',
  );
});

test('it adds the bench file to the name of rows that share a name and level', () => {
  const table = formatBenchComparison([
    {
      file: 'kettle/pour.bench.ts',
      name: 'pour',
      concurrency: 1,
      base: { medianMs: 40, spreadMs: 2 },
      head: { medianMs: 44, spreadMs: 3 },
    },
    {
      file: 'teapot/pour.bench.ts',
      name: 'pour',
      concurrency: 1,
      base: { medianMs: 12, spreadMs: 0.5 },
      head: { medianMs: 12, spreadMs: 0.5 },
    },
    {
      file: 'teapot/pour.bench.ts',
      name: 'pour',
      concurrency: 4,
      base: { medianMs: 20, spreadMs: 1 },
      head: { medianMs: 20, spreadMs: 1 },
    },
  ]);

  expect(table).toBe(
    'bench                        concurrency  base median  base spread  head median  head spread  change\n' +
      'pour (kettle/pour.bench.ts)  1            40.00ms      2.00ms       44.00ms      3.00ms       +10.0%\n' +
      'pour (teapot/pour.bench.ts)  1            12.00ms      0.50ms       12.00ms      0.50ms       +0.0%\n' +
      'pour                         4            20.00ms      1.00ms       20.00ms      1.00ms       +0.0%\n',
  );
});
