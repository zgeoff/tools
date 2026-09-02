import type { ASTNode } from '../types.ts';
import { isASTNode } from './is-ast-node.ts';

export function collectASTNodes(value: unknown): ASTNode[] {
  if (!Array.isArray(value)) {
    return isASTNode(value) ? [value] : [];
  }

  const nodes: ASTNode[] = [];

  for (const item of value) {
    if (isASTNode(item)) {
      nodes.push(item);
    }
  }

  return nodes;
}
