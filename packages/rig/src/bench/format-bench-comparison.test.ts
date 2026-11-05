import { expect, test } from 'bun:test';
import { formatBenchComparison } from './format-bench-comparison.ts';

test('it pads each column to its widest cell and shows the change of the median', () => {
  const table = formatBenchComparison([
    {
      name: 'pour one cup',
      concurrency: 1,
      base: { medianMs: 12.1, spreadMs: 0.8 },
      head: { medianMs: 11.5, spreadMs: 0.7 },
    },
    {
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
    { name: 'boil', concurrency: 16, base: null, head: { medianMs: 5, spreadMs: 0.25 } },
    { name: 'steep', concurrency: 1, base: { medianMs: 8, spreadMs: 0.5 }, head: null },
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
