import { expect, test } from 'bun:test';
import type { BenchPlan } from './pick-bench-plan.ts';
import { pickBenchPlan } from './pick-bench-plan.ts';

test.each<{
  readonly title: string;
  readonly name: string | null;
  readonly baseRef: string | null;
  readonly headBenchFiles: readonly string[];
  readonly expected: BenchPlan;
}>([
  {
    title: 'a head run of the named file',
    name: 'boil',
    baseRef: null,
    headBenchFiles: ['bench/boil.bench.ts', 'bench/steep.bench.ts'],
    expected: { kind: 'head', files: ['bench/boil.bench.ts'] },
  },
  {
    title: 'a finished run when the head has no file of the name and no base is given',
    name: 'brew',
    baseRef: null,
    headBenchFiles: ['bench/boil.bench.ts'],
    expected: {
      kind: 'finished',
      verdict: {
        output: [
          {
            stream: 'err',
            text: 'rig bench: no benchmark named "brew"; the benchmarks are boil\n',
          },
        ],
        exitCode: 1,
      },
    },
  },
  {
    title: 'a comparison when the head has no file of the name and a base is given',
    name: 'brew',
    baseRef: 'main',
    headBenchFiles: ['bench/boil.bench.ts'],
    expected: { kind: 'comparison', baseRef: 'main', files: [] },
  },
  {
    title: 'a comparison of every head file',
    name: null,
    baseRef: 'main',
    headBenchFiles: ['bench/boil.bench.ts', 'bench/steep.bench.ts'],
    expected: {
      kind: 'comparison',
      baseRef: 'main',
      files: ['bench/boil.bench.ts', 'bench/steep.bench.ts'],
    },
  },
])('it plans $title', (row) => {
  expect(pickBenchPlan(row.name, row.baseRef, row.headBenchFiles)).toStrictEqual(row.expected);
});
