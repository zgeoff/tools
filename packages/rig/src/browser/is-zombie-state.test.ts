import { expect, test } from 'bun:test';
import { isZombieState } from './is-zombie-state.ts';

test.each([
  { state: 'Z', expected: true },
  { state: 'Z+', expected: true },
  { state: 'S', expected: false },
  { state: 'Ss+', expected: false },
  { state: 'R', expected: false },
])('it finds $state a zombie: $expected', (row) => {
  expect(isZombieState(row.state)).toBe(row.expected);
});
