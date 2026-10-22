import { expect, test } from 'bun:test';
import { collectChangedPaths } from './collect-changed-paths.ts';

test('it collects a path that was clean before and holds a file after', () => {
  expect(collectChangedPaths({}, { 'src/a.test.ts': 'a1' })).toStrictEqual(['src/a.test.ts']);
});

test('it collects a path whose content hash differs', () => {
  expect(collectChangedPaths({ 'src/a.test.ts': 'a1' }, { 'src/a.test.ts': 'a2' })).toStrictEqual([
    'src/a.test.ts',
  ]);
});

test('it collects a dirty path the command deleted', () => {
  expect(collectChangedPaths({ 'src/a.test.ts': 'a1' }, { 'src/a.test.ts': null })).toStrictEqual([
    'src/a.test.ts',
  ]);
});

test('it skips a path whose content hash is the same', () => {
  expect(collectChangedPaths({ 'src/a.test.ts': 'a1' }, { 'src/a.test.ts': 'a1' })).toStrictEqual(
    [],
  );
});

test('it collects a path named like an object property that was clean before', () => {
  expect(collectChangedPaths({}, { constructor: 'c1' })).toStrictEqual(['constructor']);
});
