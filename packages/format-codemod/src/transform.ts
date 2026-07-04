import { buildEditsFromAst } from './build-edits-from-ast.ts';
import { parseSource } from './parse-source.ts';
import type { AstNode, Edit, TransformResult } from './types.ts';

// Pure transform: source string in, edited source string out, no I/O. On a parse
// error the input is returned untouched alongside the error message.
export function transform(src: string): TransformResult {
  const parsed = tryParse(src);

  if (typeof parsed === 'string') {
    return { output: src, edits: 0, parseError: parsed };
  }
  const program = parsed.program ?? parsed;
  const editList = buildEditsFromAst(src, program);
  const output = applyEdits(src, editList);

  return { output, edits: editList.length, parseError: null };
}

// The parse-error message, or the AST — AstNode is always an object, so the
// string return is unambiguous.
function tryParse(src: string): AstNode | string {
  try {
    return parseSource(src);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// Edits are pre-sorted last-to-first so earlier splices never shift later offsets.
function applyEdits(src: string, edits: readonly Edit[]): string {
  let out = src;

  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }

  return out;
}
