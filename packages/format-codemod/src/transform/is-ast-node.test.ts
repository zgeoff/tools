import { expect, test } from 'bun:test';
import { isASTNode } from './is-ast-node.ts';

test('it accepts an object with a string type property', () => {
  expect(isASTNode({ type: 'Identifier', name: 'x' })).toBeTrue();
});

test('it rejects primitives and null', () => {
  expect([null, undefined, 'Identifier', 42, true]).toSatisfyAll((value) => !isASTNode(value));
});

test('it rejects an object without a string type property', () => {
  expect(isASTNode({})).toBeFalse();
  expect(isASTNode({ type: 7 })).toBeFalse();
});

test('it rejects arrays', () => {
  expect(isASTNode([{ type: 'Identifier' }])).toBeFalse();
});
