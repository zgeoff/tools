import { expect, test } from 'bun:test';
import type { BenchSideOutcome } from './pick-comparison-verdict.ts';
import { pickComparisonVerdict } from './pick-comparison-verdict.ts';
import type { BenchVerdict } from './types.ts';

test.each<readonly [string, BenchSideOutcome, BenchSideOutcome, BenchVerdict]>([
  [
    'prints the table and exits 0 when the head is within budget',
    {
      exitCode: 0,
      report: {
        kind: 'parsed',
        entries: [
          {
            file: 'packages/kettle/bench/pour.bench.ts',
            name: 'pour one cup',
            concurrency: 1,
            medianMs: 12.1,
            spreadMs: 0.8,
            budgetMs: 80,
          },
        ],
      },
    },
    {
      exitCode: 0,
      report: {
        kind: 'parsed',
        entries: [
          {
            file: 'packages/kettle/bench/pour.bench.ts',
            name: 'pour one cup',
            concurrency: 1,
            medianMs: 11.5,
            spreadMs: 0.7,
            budgetMs: 80,
          },
        ],
      },
    },
    {
      output: [
        {
          stream: 'out',
          text:
            'bench         concurrency  base median  base spread  head median  head spread  change\n' +
            'pour one cup  1            12.10ms      0.80ms       11.50ms      0.70ms       -5.0%\n',
        },
      ],
      exitCode: 0,
    },
  ],
  [
    'prints the table and keeps the exit code of a failed base side',
    { exitCode: 3, report: { kind: 'parsed', entries: [] } },
    { exitCode: 0, report: { kind: 'parsed', entries: [] } },
    {
      output: [
        {
          stream: 'out',
          text: 'bench  concurrency  base median  base spread  head median  head spread  change\n',
        },
      ],
      exitCode: 3,
    },
  ],
  [
    'exits 1 with the reason of a refused base report',
    { exitCode: 0, report: { kind: 'refused', reason: 'the base report is cold' } },
    { exitCode: 0, report: { kind: 'refused', reason: 'the head report is cold' } },
    { output: [{ stream: 'err', text: 'rig bench: the base report is cold\n' }], exitCode: 1 },
  ],
  [
    'exits 1 with the reason of a refused head report',
    { exitCode: 0, report: { kind: 'parsed', entries: [] } },
    { exitCode: 0, report: { kind: 'refused', reason: 'the head report is cold' } },
    { output: [{ stream: 'err', text: 'rig bench: the head report is cold\n' }], exitCode: 1 },
  ],
])('it %s', (_title, base, head, expected) => {
  expect(pickComparisonVerdict(base, head)).toStrictEqual(expected);
});
