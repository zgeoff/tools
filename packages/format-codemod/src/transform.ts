import { applyEdits } from './transform/apply-edits.ts';
import { buildEditsFromAST } from './transform/build-edits-from-ast.ts';
import { parseSource } from './transform/parse-source.ts';
import type { TransformResult } from './types.ts';

export interface TransformOptions {
  readonly filename?: string;
}

export function transform(src: string, options?: TransformOptions): TransformResult {
  const parsed = parseSource(src, options?.filename ?? 'source.ts');

  if (typeof parsed === 'string') {
    return { output: src, edits: 0, parseError: parsed };
  }

  const editList = buildEditsFromAST(src, parsed);
  const output = applyEdits(src, editList);

  return { output, edits: editList.length, parseError: null };
}
