import { parseSync } from 'oxc-parser';
import type { AstNode, ParsedSource } from './types.ts';

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

  return { program: toAstNode(parsed.program), comments: parsed.comments };
}

// oxc's typed AST satisfies AstNode structurally, but interfaces are never
// implicitly assignable to index-signature types; this boundary is the one
// place the tree's static shape is asserted, guarded at runtime.
function toAstNode(program: unknown): AstNode {
  if (
    typeof program === 'object' &&
    program !== null &&
    'type' in program &&
    typeof program.type === 'string'
  ) {
    return program as AstNode;
  }

  throw new TypeError('oxc-parser returned a malformed program node');
}
