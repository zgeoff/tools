import type { ASTNode } from '../types.ts';
import { collectASTNodes } from './collect-ast-nodes.ts';

export function collectChildNodes(node: ASTNode): ASTNode[] {
  const children: ASTNode[] = [];

  for (const key of Object.keys(node)) {
    if (key !== 'loc' && key !== 'parent') {
      children.push(...collectASTNodes(node[key]));
    }
  }

  return children;
}
