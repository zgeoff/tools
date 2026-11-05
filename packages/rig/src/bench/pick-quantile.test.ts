import { expect, test } from 'bun:test';
import { pickQuantile } from './pick-quantile.ts';

test('it picks the middle sample of an odd count as the median', () => {
  expect(pickQuantile([9, 1, 5], 0.5)).toBe(5);
});

test('it averages the two middle samples of an even count as the median', () => {
  expect(pickQuantile([4, 1, 3, 2], 0.5)).toBe(2.5);
});

test.each([
  [0.25, 1.75],
  [0.75, 3.25],
])('it interpolates the %d quantile between the samples around it', (quantile, expected) => {
  expect(pickQuantile([4, 1, 3, 2], quantile)).toBe(expected);
});
