import { expect, test } from 'bun:test';
import { collectBenchFiles } from './collect-bench-files.ts';

test('it collects the bench files of a package', () => {
  const files = [
    'packages/kettle/package.json',
    'packages/kettle/bench/boil.bench.ts',
    'packages/kettle/bench/fixtures.ts',
    'packages/kettle/src/steep.bench.ts',
  ];

  expect(collectBenchFiles(files, true)).toStrictEqual(['packages/kettle/bench/boil.bench.ts']);
});

test('it leaves out a bench folder in a folder with no package.json', () => {
  const files = ['packages/kettle/src/legacy/bench/boil.bench.ts', 'packages/kettle/package.json'];

  expect(collectBenchFiles(files, true)).toBeEmpty();
});

test('it collects the bench files at the root of a single-package repo', () => {
  expect(collectBenchFiles(['bench/boil.bench.ts'], false)).toStrictEqual(['bench/boil.bench.ts']);
});

test('it leaves out the root bench files of a workspace repo', () => {
  expect(collectBenchFiles(['bench/boil.bench.ts'], true)).toBeEmpty();
});
