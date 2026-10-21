import { expect, test } from 'bun:test';
import { isOneOf } from './is-one-of.ts';

test.each(['small', 'large'])('it accepts %s, a listed value', (value) => {
  expect(isOneOf(value, ['small', 'large'] as const)).toBeTrue();
});

test.each([['medium'], [undefined], [0], ['Small']])('it rejects %p', (value) => {
  expect(isOneOf(value, ['small', 'large'] as const)).toBeFalse();
});

test('it matches NaN in the list', () => {
  expect(isOneOf(Number.NaN, [Number.NaN])).toBeTrue();
});

test('it narrows the value to the listed values', () => {
  const sizes = ['small', 'large'] as const;
  const value: string = sizes[1];
  const size: 'small' | 'large' | null = isOneOf(value, sizes) ? value : null;

  expect(size).toBe('large');
});
