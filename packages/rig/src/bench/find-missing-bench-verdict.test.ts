import { expect, test } from 'bun:test';
import { findMissingBenchVerdict } from './find-missing-bench-verdict.ts';
import type { BenchVerdict } from './types.ts';

test.each<{
  readonly title: string;
  readonly name: string | null;
  readonly head: readonly string[];
  readonly base: readonly string[];
  readonly expected: BenchVerdict | null;
}>([
  {
    title: 'a run of every benchmark when the head has one',
    name: null,
    head: ['bench/boil.bench.ts'],
    base: [],
    expected: null,
  },
  {
    title: 'a named benchmark that the head has',
    name: 'boil',
    head: ['bench/boil.bench.ts'],
    base: [],
    expected: null,
  },
  {
    title: 'a named benchmark that only the base has',
    name: 'brew',
    head: ['bench/boil.bench.ts'],
    base: ['bench/brew.bench.ts'],
    expected: null,
  },
  {
    title: 'a repo with no benchmark',
    name: null,
    head: [],
    base: [],
    expected: {
      output: [{ stream: 'out', text: 'rig: the repo has no benchmarks\n' }],
      exitCode: 0,
    },
  },
  {
    title: 'a name that neither side has',
    name: 'brew',
    head: ['bench/boil.bench.ts', 'bench/steep.bench.ts'],
    base: ['bench/steep.bench.ts', 'bench/pour.bench.ts'],
    expected: {
      output: [
        {
          stream: 'err',
          text: 'rig bench: no benchmark named "brew"; the benchmarks are boil, steep, pour\n',
        },
      ],
      exitCode: 1,
    },
  },
])('it decides $title', (row) => {
  expect(findMissingBenchVerdict(row.name, row.head, row.base)).toStrictEqual(row.expected);
});
