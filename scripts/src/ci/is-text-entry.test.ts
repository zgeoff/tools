import { expect, test } from 'bun:test';
import { isTextEntry } from './is-text-entry.ts';

test('it accepts an entry whose value is text', () => {
  expect(isTextEntry(['flour', 'rye'])).toBeTrue();
});

test.each([
  ['a number', 3],
  ['a boolean', true],
  ['null', null],
  ['an object', { grain: 'rye' }],
])('it refuses an entry whose value is %s', (_label, value) => {
  expect(isTextEntry(['flour', value])).toBeFalse();
});
