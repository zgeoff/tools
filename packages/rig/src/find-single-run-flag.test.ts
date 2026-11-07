import { expect, test } from 'bun:test';
import { findSingleRunFlag } from './find-single-run-flag.ts';

test.each([
  ['--watch', ['--bail', '--watch']],
  ['--coverage', ['--coverage']],
  ['--coverage-reporter=lcov', ['--coverage-reporter=lcov']],
  ['--coverage-dir=out', ['--seed=1', '--coverage-dir=out']],
  ['--reporter-outfile=report.xml', ['--reporter=junit', '--reporter-outfile=report.xml']],
  ['--preload=./setup.ts', ['--preload=./setup.ts']],
])('it finds %s, which needs one bun test run', (flag, flags) => {
  expect(findSingleRunFlag(flags)).toBe(flag);
});

test('it finds no flag in flags that any number of runs can take', () => {
  expect(findSingleRunFlag(['--bail', '--seed=1', '--rerun-each=2'])).toBeUndefined();
});
