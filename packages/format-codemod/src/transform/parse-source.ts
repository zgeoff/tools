import { parseSync } from 'oxc-parser';
import type { ASTNode, ParsedSource } from '../types.ts';

// The filename picks the dialect — `.tsx` enables JSX, anything else parses as
// plain TypeScript, so `.ts`-only syntax like `<string>value` assertions and
// un-comma'd generic arrows parse correctly. oxc reports syntax errors as a
// list instead of throwing; any error means node offsets can't be trusted for
// splicing, so the first message is returned and the caller skips the file.
// ParsedSource is always an object, so the string return is unambiguous.
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

// oxc's typed AST satisfies ASTNode structurally, but interfaces are never
// implicitly assignable to index-signature types; this predicate is the one
// place the tree's static shape crosses that boundary, guarded at runtime.
function isASTNode(value: unknown): value is ASTNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}
