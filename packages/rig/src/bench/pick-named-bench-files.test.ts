import { expect, test } from 'bun:test';
import { pickNamedBenchFiles } from './pick-named-bench-files.ts';

test.each<readonly [string, string | null, readonly string[]]>([
  [
    'every file for no name',
    null,
    ['packages/kettle/bench/boil.bench.ts', 'packages/kettle/bench/steep.bench.ts'],
  ],
  ['the file of the name', 'steep', ['packages/kettle/bench/steep.bench.ts']],
  ['no file for a name no file has', 'brew', []],
])('it picks %s', (_title, name, expected) => {
  expect(
    pickNamedBenchFiles(
      ['packages/kettle/bench/boil.bench.ts', 'packages/kettle/bench/steep.bench.ts'],
      name,
    ),
  ).toStrictEqual(expected);
});
