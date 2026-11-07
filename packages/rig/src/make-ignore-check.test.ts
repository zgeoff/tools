import { expect, test } from 'bun:test';
import { makeIgnoreCheck } from './make-ignore-check.ts';

test.each([
  ['skip/oven.test.ts', true],
  ['skip/nested/tray.test.tsx', true],
  ['src/oven.slow.test.ts', true],
  ['src/skip/oven.test.ts', false],
  ['src/oven.test.ts', false],
])('it finds %s ignored: %p', (path, isIgnored) => {
  const isIgnoredPath = makeIgnoreCheck(['skip/**', '**/*.slow.test.ts']);

  expect(isIgnoredPath(path)).toBe(isIgnored);
});

test('it ignores no path when the list is empty', () => {
  expect(makeIgnoreCheck([])('skip/oven.test.ts')).toBeFalse();
});
