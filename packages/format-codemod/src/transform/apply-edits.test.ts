import { expect, test } from 'bun:test';
import { applyEdits } from './apply-edits.ts';

test('it returns the input unchanged when there are no edits', () => {
  expect(applyEdits('const a = 1;\n', [])).toBe('const a = 1;\n');
});

test('it applies a single insertion at the given offset', () => {
  const out = applyEdits('ab', [{ start: 1, end: 1, replacement: 'X' }]);

  expect(out).toBe('aXb');
});

test('it applies multiple edits pre-sorted last-to-first', () => {
  const edits = [
    { start: 4, end: 4, replacement: 'X' },
    { start: 2, end: 2, replacement: 'Y' },
  ];

  expect(applyEdits('abcdef', edits)).toBe('abYcdXef');
});

test('it applies replacements that change the text length', () => {
  const edits = [
    { start: 3, end: 5, replacement: '' },
    { start: 1, end: 2, replacement: 'long' },
  ];

  expect(applyEdits('abcdef', edits)).toBe('alongcf');
});
