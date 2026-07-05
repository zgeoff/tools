import type { ASTNode } from '../types.ts';
import { collectASTNodes } from './collect-ast-nodes.ts';

/**
 * A node's direct child nodes across all properties, skipping the location
 * and parent back-references a traversal must not follow.
 */
export function collectChildNodes(node: ASTNode): ASTNode[] {
  const children: ASTNode[] = [];

  for (const key of Object.keys(node)) {
    if (key !== 'loc' && key !== 'parent') {
      children.push(...collectASTNodes(node[key]));
    }
  }

  return children;
}
