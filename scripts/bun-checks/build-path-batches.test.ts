import { expect, test } from 'bun:test';
import { buildPathBatches } from './build-path-batches.ts';

test('it keeps every path in one batch when they fit the limit', () => {
  expect(buildPathBatches(['a.sh', 'b.sh'], 100)).toStrictEqual([['a.sh', 'b.sh']]);
});

test('it starts a new batch before a path that would pass the limit, counting each NUL', () => {
  // Each path takes 5 bytes with its NUL, so two fill a limit of 10.
  expect(buildPathBatches(['a.sh', 'b.sh', 'c.sh'], 10)).toStrictEqual([
    ['a.sh', 'b.sh'],
    ['c.sh'],
  ]);
});

test('it counts the bytes of a path, not its characters', () => {
  // `é.sh` takes 6 bytes with its NUL, so it cannot share a limit of 10 with `a.sh`.
  expect(buildPathBatches(['a.sh', 'é.sh'], 10)).toStrictEqual([['a.sh'], ['é.sh']]);
});

test('it gives a path longer than the limit a batch of its own', () => {
  expect(buildPathBatches(['a.sh', 'long/path.sh', 'b.sh'], 6)).toStrictEqual([
    ['a.sh'],
    ['long/path.sh'],
    ['b.sh'],
  ]);
});

test('it returns no batch for no paths', () => {
  expect(buildPathBatches([], 10)).toStrictEqual([]);
});
