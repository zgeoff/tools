import { buildEditsFromAst } from './build-edits-from-ast.ts';
import { parseSource } from './parse-source.ts';
import type { Edit, TransformResult } from './types.ts';

export interface TransformOptions {
  // Picks the parse dialect: `.tsx` enables JSX, anything else is plain
  // TypeScript. Defaults to 'source.ts' — JSX callers must say so.
  readonly filename?: string;
}

// Pure transform: source string in, edited source string out, no I/O. On a
// parse error the input is returned untouched alongside the error message.
export function transform(src: string, options?: TransformOptions): TransformResult {
  const parsed = parseSource(src, options?.filename ?? 'source.ts');

  if (typeof parsed === 'string') {
    return { output: src, edits: 0, parseError: parsed };
  }
  const editList = buildEditsFromAst(src, parsed.program);
  const output = applyEdits(src, editList);

  return { output, edits: editList.length, parseError: null };
}

// Edits are pre-sorted last-to-first so earlier splices never shift later offsets.
function applyEdits(src: string, edits: readonly Edit[]): string {
  let out = src;

  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }

  return out;
}
