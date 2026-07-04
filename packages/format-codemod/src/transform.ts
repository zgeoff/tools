import { applyEdits } from './transform/apply-edits.ts';
import { buildEditsFromAST } from './transform/build-edits-from-ast.ts';
import { parseSource } from './transform/parse-source.ts';
import type { TransformResult } from './types.ts';

export interface TransformOptions {
  /**
   * Picks the parse dialect: `.tsx` enables JSX, anything else is plain
   * TypeScript. Defaults to 'source.ts' — JSX callers must say so.
   */
  readonly filename?: string;
}

/**
 * Pure transform: source string in, edited source string out, no I/O. On a
 * parse error the input is returned untouched alongside the error message.
 */
export function transform(src: string, options?: TransformOptions): TransformResult {
  const parsed = parseSource(src, options?.filename ?? 'source.ts');

  if (typeof parsed === 'string') {
    return { output: src, edits: 0, parseError: parsed };
  }
  const editList = buildEditsFromAST(src, parsed);
  const output = applyEdits(src, editList);

  return { output, edits: editList.length, parseError: null };
}
