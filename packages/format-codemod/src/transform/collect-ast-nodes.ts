import type { ASTNode } from '../types.ts';
import { isASTNode } from './is-ast-node.ts';

/**
 * The AST nodes in a property value: the node itself, an array's node
 * elements, or nothing for non-node values.
 */
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
