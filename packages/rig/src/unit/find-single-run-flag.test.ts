import { expect, test } from 'bun:test';
import { findSingleRunFlag } from './find-single-run-flag.ts';

test.each([
  ['--watch', ['--bail', '--watch'], false],
  ['--coverage', ['--coverage'], true],
  ['--coverage-reporter=lcov', ['--coverage-reporter=lcov'], true],
  ['--coverage-dir=out', ['--seed=1', '--coverage-dir=out'], true],
  ['--reporter-outfile=report.xml', ['--reporter=junit', '--reporter-outfile=report.xml'], true],
  ['--preload=./setup.ts', ['--preload=./setup.ts'], true],
])('it finds %s, which needs one bun test run', (flag, flags, holdsPath) => {
  expect(findSingleRunFlag(flags)).toStrictEqual({ flag, holdsPath });
});

test('it finds no flag in flags that any number of runs can take', () => {
  expect(findSingleRunFlag(['--bail', '--seed=1', '--rerun-each=2'])).toBeUndefined();
});
