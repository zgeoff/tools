import { expect, test } from 'bun:test';
import { collectBenchFiles } from './collect-bench-files.ts';

test('it collects the bench files in the bench folder of a package', () => {
  const files = [
    'packages/kettle/package.json',
    'packages/kettle/bench/boil.bench.ts',
    'packages/kettle/bench/fixtures.ts',
  ];

  expect(collectBenchFiles(files, true)).toStrictEqual(['packages/kettle/bench/boil.bench.ts']);
});

test('it collects a bench file beside its module under the src folder of a package', () => {
  const files = [
    'packages/kettle/package.json',
    'packages/kettle/src/steep.bench.ts',
    'packages/kettle/src/spout/pour.bench.ts',
    'packages/kettle/src/steep.ts',
  ];

  expect(collectBenchFiles(files, true)).toStrictEqual([
    'packages/kettle/src/steep.bench.ts',
    'packages/kettle/src/spout/pour.bench.ts',
  ]);
});

test('it leaves out a bench file outside the bench and src folders of a package', () => {
  const files = ['packages/kettle/package.json', 'packages/kettle/scripts/steep.bench.ts'];

  expect(collectBenchFiles(files, true)).toBeEmpty();
});

test('it leaves out a src bench file in a folder with no package.json', () => {
  expect(collectBenchFiles(['tools/kettle/src/steep.bench.ts'], true)).toBeEmpty();
});

test('it collects a src bench file at the root of a single-package repo', () => {
  expect(collectBenchFiles(['src/steep.bench.ts'], false)).toStrictEqual(['src/steep.bench.ts']);
});

test('it leaves out a bench folder in a folder with no package.json', () => {
  const files = ['packages/kettle/tools/bench/boil.bench.ts', 'packages/kettle/package.json'];

  expect(collectBenchFiles(files, true)).toBeEmpty();
});

test('it collects the bench files at the root of a single-package repo', () => {
  expect(collectBenchFiles(['bench/boil.bench.ts'], false)).toStrictEqual(['bench/boil.bench.ts']);
});

test('it leaves out the root bench files of a workspace repo', () => {
  expect(collectBenchFiles(['bench/boil.bench.ts'], true)).toBeEmpty();
});

test('it collects the bench files of a package that sits under a folder named src', () => {
  const files = ['apps/src/kettle/package.json', 'apps/src/kettle/bench/boil.bench.ts'];

  expect(collectBenchFiles(files, true)).toStrictEqual(['apps/src/kettle/bench/boil.bench.ts']);
});
