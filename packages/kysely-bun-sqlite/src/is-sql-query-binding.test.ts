import { expect, test } from 'bun:test';
import { isSQLQueryBinding } from './is-sql-query-binding.ts';

test.each([
  ['a string', 'fern'],
  ['a number', 3],
  ['a bigint', 3n],
  ['a boolean', true],
  ['null', null],
  ['a byte array', new Uint8Array([1, 2])],
  ['a float array', new Float64Array([1.5])],
])('it accepts %s', (_label, value) => {
  expect(isSQLQueryBinding(value)).toBeTrue();
});

test.each([
  ['undefined', undefined],
  ['a Date', new Date('2026-01-01')],
  ['a plain object', { species: 'fern' }],
  ['an array', ['fern']],
  ['a DataView', new DataView(new ArrayBuffer(2))],
  ['a symbol', Symbol('fern')],
])('it rejects %s', (_label, value) => {
  expect(isSQLQueryBinding(value)).toBeFalse();
});
