import type { ASTNode } from '../types.ts';

export function isASTNode(value: unknown): value is ASTNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}
