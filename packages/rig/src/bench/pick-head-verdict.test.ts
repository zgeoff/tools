import { expect, test } from 'bun:test';
import type { ParsedBenchReport } from './parse-bench-report.ts';
import { pickHeadVerdict } from './pick-head-verdict.ts';
import type { BenchVerdict } from './types.ts';

test.each<readonly [string, ParsedBenchReport, number, BenchVerdict]>([
  [
    'exits 0 with no output when every entry is within budget',
    {
      kind: 'parsed',
      entries: [
        {
          file: 'bench/boil.bench.ts',
          name: 'boil',
          concurrency: 1,
          medianMs: 4,
          spreadMs: 0.5,
          budgetMs: 50,
        },
      ],
    },
    0,
    { output: [], exitCode: 0 },
  ],
  [
    'exits 1 when an entry is over its budget',
    {
      kind: 'parsed',
      entries: [
        {
          file: 'bench/boil.bench.ts',
          name: 'boil',
          concurrency: 4,
          medianMs: 61,
          spreadMs: 3,
          budgetMs: 50,
        },
      ],
    },
    0,
    { output: [], exitCode: 1 },
  ],
  [
    'keeps the exit code of a failed side',
    { kind: 'parsed', entries: [] },
    3,
    { output: [], exitCode: 3 },
  ],
  [
    'exits 1 with the reason of a refused report',
    { kind: 'refused', reason: 'the bench report holds a line that is no entry: steam' },
    0,
    {
      output: [
        {
          stream: 'err',
          text: 'rig bench: the bench report holds a line that is no entry: steam\n',
        },
      ],
      exitCode: 1,
    },
  ],
])('it %s', (_title, report, headExitCode, expected) => {
  expect(pickHeadVerdict(report, headExitCode)).toStrictEqual(expected);
});
