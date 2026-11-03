import { expect, test } from 'bun:test';
import { pickMedian } from './pick-median.ts';

test('it picks the middle sample of an odd count', () => {
  expect(pickMedian([9, 1, 5])).toBe(5);
});

test('it averages the two middle samples of an even count', () => {
  expect(pickMedian([4, 1, 3, 2])).toBe(2.5);
});
