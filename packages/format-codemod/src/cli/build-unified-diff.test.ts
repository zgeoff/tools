import { expect, test } from 'bun:test';
import { buildUnifiedDiff } from './build-unified-diff.ts';

test('it returns an empty string when both sides are identical', () => {
  expect(buildUnifiedDiff('a\nb\n', 'a\nb\n', 'x.ts')).toBe('');
});

test('it labels both file headers with the given name', () => {
  const diff = buildUnifiedDiff('a\n', 'a\nb\n', 'x.ts');

  expect(diff).toStartWith('--- x.ts\n+++ x.ts\n');
});

test('it wraps a change in a hunk with up to three lines of context', () => {
  const before = '1\n2\n3\n4\n5\n6\n7\n8\n9\n';
  const after = '1\n2\n3\n4\nNEW\n5\n6\n7\n8\n9\n';
  const diff = buildUnifiedDiff(before, after, 'x.ts');

  expect(diff).toInclude('@@ -2,6 +2,7 @@\n 2\n 3\n 4\n+NEW\n 5\n 6\n 7\n');
});

test('it merges nearby changes into a single hunk', () => {
  const diff = buildUnifiedDiff('1\n2\n3\n4\n5\n', '1\nX\n3\nY\n5\n', 'x.ts');

  expect(diff.match(/^@@/gmu)).toHaveLength(1);
});

test('it separates distant changes into their own hunks', () => {
  const before = 'X\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\nY\n';
  const after = 'x\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\ny\n';
  const diff = buildUnifiedDiff(before, after, 'x.ts');

  expect(diff.match(/^@@/gmu)).toHaveLength(2);
});

test('it finds the minimal diff when lines repeat', () => {
  const diff = buildUnifiedDiff('x\na\nx\n', 'a\nx\n', 'x.ts');
  const changed = diff.split('\n').filter((l) => l.startsWith('-') || l.startsWith('+'));

  // headers aside, a single deletion is the whole story
  expect(changed).toEqual(['--- x.ts', '+++ x.ts', '-x']);
});

test('it anchors a pure insertion hunk to the line before it', () => {
  const diff = buildUnifiedDiff('1\n', '1\n2\n', 'x.ts');

  expect(diff).toInclude('@@ -1,1 +1,2 @@\n 1\n+2\n');
});
