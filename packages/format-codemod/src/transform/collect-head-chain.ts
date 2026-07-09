import type { ASTNode } from '../types.ts';
import { isASTNode } from './is-ast-node.ts';

/**
 * Wrapper node types whose named property leads toward the head of an
 * expression chain — `a.b().c` unwraps call by call, member by member, down
 * to `a`.
 */
const HEAD_PROPERTY: Readonly<Record<string, string>> = {
  CallExpression: 'callee',
  MemberExpression: 'object',
  ChainExpression: 'expression',
  AwaitExpression: 'argument',
  TSNonNullExpression: 'expression',
  ParenthesizedExpression: 'expression',
};

/**
 * The nodes on the walk from an expression to its head, outermost first and
 * ending at the head itself — `(await f()).prop` yields the member access,
 * the parenthesis, the await, the call, and finally `f`. Nodes outside the
 * walk (call arguments, ternary branches) never appear, so a scan of the
 * chain sees only what a reader meets before the expression's first token.
 */
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
