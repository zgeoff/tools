import type { ASTNode } from '../types.ts';
import { isASTNode } from './is-ast-node.ts';

const HEAD_PROPERTY: Readonly<Record<string, string>> = {
  CallExpression: 'callee',
  MemberExpression: 'object',
  ChainExpression: 'expression',
  AwaitExpression: 'argument',
  TSNonNullExpression: 'expression',
  ParenthesizedExpression: 'expression',
};

export function collectHeadChain(expression: ASTNode): ASTNode[] {
  const chain: ASTNode[] = [];
  let current: ASTNode | undefined = expression;

  while (current !== undefined) {
    chain.push(current);

    const property: string | undefined = HEAD_PROPERTY[current.type];
    const inner: unknown = property === undefined ? undefined : current[property];

    current = isASTNode(inner) ? inner : undefined;
  }

  return chain;
}
