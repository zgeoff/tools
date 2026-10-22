import { expect, test } from 'bun:test';
import { bashSnapshotSchema } from './bash-snapshot-schema.ts';

test('it accepts a recorded snapshot with HEAD and a hash or null per path', () => {
  expect(
    bashSnapshotSchema.parse({
      kind: 'recorded',
      head: 'c0ffee',
      hashes: { 'src/a.test.ts': 'a1', 'b.md': null },
    }),
  ).toStrictEqual({
    kind: 'recorded',
    head: 'c0ffee',
    hashes: { 'src/a.test.ts': 'a1', 'b.md': null },
  });
});

test('it accepts a failed snapshot that keeps the git error', () => {
  expect(
    bashSnapshotSchema.parse({ kind: 'failed', error: 'fatal: bad index file' }),
  ).toStrictEqual({ kind: 'failed', error: 'fatal: bad index file' });
});

test('it rejects a hash that is not a string or null', () => {
  const parsed = bashSnapshotSchema.safeParse({
    kind: 'recorded',
    head: null,
    hashes: { 'src/a.test.ts': 7 },
  });

  expect(parsed.error?.issues.map((issue) => issue.path)).toStrictEqual([
    ['hashes', 'src/a.test.ts'],
  ]);
});
