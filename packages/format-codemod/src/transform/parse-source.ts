import { parseSync } from 'oxc-parser';
import type { ASTNode, ParsedSource } from '../types.ts';

export function parseSource(src: string, filename: string): ParsedSource | string {
  const parsed = parseSync(filename, src);
  const [firstError] = parsed.errors;

  if (firstError !== undefined) {
    return firstError.message;
  }

  if (!isASTNode(parsed.program)) {
    throw new TypeError('oxc-parser returned a malformed program node');
  }

  return { program: parsed.program, comments: parsed.comments };
}

function isASTNode(value: unknown): value is ASTNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}
