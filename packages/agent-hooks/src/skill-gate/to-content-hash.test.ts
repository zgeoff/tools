import { expect, test } from 'bun:test';
import { toContentHash } from './to-content-hash.ts';

test('it gives the same content the same hash and other content another', () => {
  const encoder = new TextEncoder();

  const first = toContentHash(encoder.encode('alpha\n'));
  const again = toContentHash(encoder.encode('alpha\n'));
  const other = toContentHash(encoder.encode('beta\n'));

  expect(first).toBe(again);
  expect(first).not.toBe(other);
});
