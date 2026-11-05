import { expect, test } from 'bun:test';
import { pickBenchExitCode } from './pick-bench-exit-code.ts';

test.each([
  ['0 when every side ran and each entry is within budget', [0, 0], 4, 0],
  ['1 when a head entry is over its budget', [0], 60, 1],
  ['the exit code of the first side that failed', [0, 3], 4, 3],
])('it exits %s', (_title, sideExitCodes, medianMs, expected) => {
  expect(
    pickBenchExitCode(sideExitCodes, [
      {
        file: 'bench/boil.bench.ts',
        name: 'boil',
        concurrency: 1,
        medianMs,
        spreadMs: 0.5,
        budgetMs: 50,
      },
    ]),
  ).toBe(expected);
});
