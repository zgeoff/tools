import { expect, test } from 'bun:test';
import { collectChildNodes } from './collect-child-nodes.ts';

test('it collects nodes from object and array properties', () => {
  const node = {
    type: 'BinaryExpression',
    left: { type: 'Identifier', name: 'a' },
    arguments: [{ type: 'Identifier', name: 'b' }, 1],
  };

  expect(collectChildNodes(node)).toEqual([
    { type: 'Identifier', name: 'a' },
    { type: 'Identifier', name: 'b' },
  ]);
});

test('it skips loc and parent back-references', () => {
  const node = {
    type: 'Identifier',
    loc: { type: 'SourceLocation' },
    parent: { type: 'Program' },
  };

  expect(collectChildNodes(node)).toBeEmpty();
});

test('it ignores non-node property values', () => {
  const node = { type: 'Literal', value: 42, raw: '42', start: 0, end: 2 };

  expect(collectChildNodes(node)).toBeEmpty();
});
