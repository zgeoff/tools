import { expect, test } from 'bun:test';
import { findBearerToken } from './find-bearer-token.ts';

test.each([
  { header: 'Bearer abc', expected: 'abc' },
  { header: 'bearer abc', expected: 'abc' },
  { header: 'Basic abc', expected: null },
  { header: 'Bearer', expected: null },
  { header: 'Bearer a b', expected: null },
  { header: null, expected: null },
])('#findBearerToken returns $expected for $header', (row) => {
  expect(findBearerToken(row.header)).toBe(row.expected);
});
