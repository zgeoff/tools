import { expect, test } from 'bun:test';
import { isRecord } from './is-record.ts';

test.each([
  ['an object', { name: 'left-pad' }, true],
  ['an array', ['left-pad'], false],
  ['null', null, false],
  ['a string', 'left-pad', false],
])('it reads %s as a record: %p', (_label, value, expected) => {
  expect(isRecord(value)).toBe(expected);
});
