import { expect, test } from 'bun:test';
import { isRecord } from './is-record.ts';

test.each([
  ['an object', { count: 1 }, true],
  ['an array', [1], false],
  ['null', null, false],
  ['a string', 'a', false],
])('it tells whether %s is a record', (_label, value, expected) => {
  expect(isRecord(value)).toBe(expected);
});
