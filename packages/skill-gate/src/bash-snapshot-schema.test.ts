import { expect, test } from 'bun:test';
import { bashSnapshotSchema } from './bash-snapshot-schema.ts';

test('it accepts a record with HEAD and a hash or null per path', () => {
  expect(
    bashSnapshotSchema.parse({ head: 'c0ffee', hashes: { 'src/a.test.ts': 'a1', 'b.md': null } }),
  ).toStrictEqual({ head: 'c0ffee', hashes: { 'src/a.test.ts': 'a1', 'b.md': null } });
});

test('it rejects a hash that is not a string or null', () => {
  const parsed = bashSnapshotSchema.safeParse({ head: null, hashes: { 'src/a.test.ts': 7 } });

  expect(parsed.error?.issues.map((issue) => issue.path)).toStrictEqual([
    ['hashes', 'src/a.test.ts'],
  ]);
});
