import { expect, test } from 'bun:test';
import { isTestFile } from './is-test-file.ts';

test.each([
  ['src/oven.test.ts', true],
  ['src/view.test.tsx', true],
  ['src/oven_spec.js', true],
  ['src/oven.spec.jsx', true],
  ['src/oven.ts', false],
  ['e2e/README.md', false],
])('it finds %s a test file: %p', (path, isTest) => {
  expect(isTestFile(path)).toBe(isTest);
});
