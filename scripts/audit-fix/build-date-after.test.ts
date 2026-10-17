import { expect, test } from 'bun:test';
import { buildDateAfter } from './build-date-after.ts';

test.each([
  ['2026-10-17', 7, '2026-10-24'],
  ['2026-10-28', 7, '2026-11-04'],
  ['2026-12-31', 1, '2027-01-01'],
])('it gives the date after %s plus %i days', (date, days, expected) => {
  expect(buildDateAfter(date, days)).toBe(expected);
});
