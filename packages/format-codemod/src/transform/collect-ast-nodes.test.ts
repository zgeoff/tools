import { expect, test } from 'bun:test';
import { collectASTNodes } from './collect-ast-nodes.ts';

test('it wraps a lone node in an array', () => {
  expect(collectASTNodes({ type: 'Identifier', name: 'x' })).toEqual([
    { type: 'Identifier', name: 'x' },
  ]);
});

test('it returns nothing for a non-node value', () => {
  expect(collectASTNodes('Identifier')).toBeEmpty();
  expect(collectASTNodes(null)).toBeEmpty();
  expect(collectASTNodes(undefined)).toBeEmpty();
});

test('it keeps only the node elements of a mixed array', () => {
  const value = [{ type: 'A' }, 3, null, { type: 'B' }, 'text'];

  expect(collectASTNodes(value)).toEqual([{ type: 'A' }, { type: 'B' }]);
});

test('it returns nothing for an empty array', () => {
  expect(collectASTNodes([])).toBeEmpty();
});
