import { expect, test } from 'bun:test';
import { collectChangedPaths } from './collect-changed-paths.ts';

test('it collects a path that held no file before and holds one after', () => {
  expect(
    collectChangedPaths({}, { 'src/a.test.ts': null }, { 'src/a.test.ts': 'a1' }),
  ).toStrictEqual(['src/a.test.ts']);
});

test('it collects a recorded path whose content hash differs', () => {
  expect(
    collectChangedPaths({ 'src/a.test.ts': 'a1' }, {}, { 'src/a.test.ts': 'a2' }),
  ).toStrictEqual(['src/a.test.ts']);
});

test('it collects a recorded path the command deleted', () => {
  expect(
    collectChangedPaths({ 'src/a.test.ts': 'a1' }, {}, { 'src/a.test.ts': null }),
  ).toStrictEqual(['src/a.test.ts']);
});

test('it skips a recorded path whose content hash is the same', () => {
  expect(
    collectChangedPaths({ 'src/a.test.ts': 'a1' }, {}, { 'src/a.test.ts': 'a1' }),
  ).toStrictEqual([]);
});

test('it compares a path that was clean before with its content at HEAD', () => {
  expect(
    collectChangedPaths(
      {},
      { 'src/a.test.ts': 'a1', 'src/b.test.ts': 'b1' },
      { 'src/a.test.ts': 'a1', 'src/b.test.ts': 'b2' },
    ),
  ).toStrictEqual(['src/b.test.ts']);
});

test('it prefers the recorded content over the content at HEAD', () => {
  expect(
    collectChangedPaths(
      { 'src/a.test.ts': 'a2' },
      { 'src/a.test.ts': 'a1' },
      { 'src/a.test.ts': 'a2' },
    ),
  ).toStrictEqual([]);
});

test('it collects a path named like an object property that held no file before', () => {
  expect(collectChangedPaths({}, {}, { constructor: 'c1' })).toStrictEqual(['constructor']);
});
