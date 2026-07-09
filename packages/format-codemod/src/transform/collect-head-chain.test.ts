import { expect, test } from 'bun:test';
import { collectHeadChain } from './collect-head-chain.ts';

test('it walks call and member wrappers down to the head identifier', () => {
  const head = { type: 'Identifier' };
  const callee = { type: 'MemberExpression', object: head };
  const call = { type: 'CallExpression', callee };

  expect(collectHeadChain(call)).toEqual([call, callee, head]);
});

test('it steps through an await on the way to the head', () => {
  const head = { type: 'Identifier' };
  const inner = { type: 'CallExpression', callee: head };
  const awaited = { type: 'AwaitExpression', argument: inner };
  const member = { type: 'MemberExpression', object: awaited };

  expect(collectHeadChain(member)).toEqual([member, awaited, inner, head]);
});

test('it stops at a node without a head property', () => {
  const head = { type: 'NewExpression', callee: { type: 'Identifier' } };
  const member = { type: 'MemberExpression', object: head };

  expect(collectHeadChain(member)).toEqual([member, head]);
});

test('it returns a wrapperless expression alone', () => {
  const literal = { type: 'Literal' };

  expect(collectHeadChain(literal)).toEqual([literal]);
});
