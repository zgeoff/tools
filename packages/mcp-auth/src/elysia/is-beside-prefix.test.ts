import { expect, test } from 'bun:test';
import { isBesidePrefix } from './is-beside-prefix.ts';

test.each([
  { path: '/api', prefix: '/api', expected: true },
  { path: '/api/x', prefix: '/api', expected: true },
  { path: '/api/x', prefix: '/api/', expected: true },
  { path: '/apiary', prefix: '/api', expected: false },
  { path: '/mcp', prefix: '/api', expected: false },
])('#isBesidePrefix answers $expected for $path under $prefix', (row) => {
  expect(isBesidePrefix(row.path, row.prefix)).toBe(row.expected);
});
