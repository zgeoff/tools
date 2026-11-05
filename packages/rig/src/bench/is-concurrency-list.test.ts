import { expect, test } from 'bun:test';
import { isConcurrencyList } from './is-concurrency-list.ts';

test.each([
  ['[1]', [1]],
  ['[1, 4, 16]', [1, 4, 16]],
])('it accepts %s', (_title, value) => {
  expect(isConcurrencyList(value)).toBeTrue();
});

test.each([
  ['an empty list', []],
  ['a zero', [0]],
  ['a negative level', [-2]],
  ['a fraction', [1.5]],
  ['an unsafe integer', [2 ** 60]],
  ['a repeated level', [4, 4]],
  ['a text level', ['4']],
  ['a number', 4],
  ['undefined', undefined],
])('it refuses %s', (_title, value) => {
  expect(isConcurrencyList(value)).toBeFalse();
});
