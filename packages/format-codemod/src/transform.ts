import { applyEdits } from './transform/apply-edits.ts';
import { buildEditsFromAST } from './transform/build-edits-from-ast.ts';
import { parseSource } from './transform/parse-source.ts';
import type { TransformResult } from './types.ts';

export interface TransformOptions {
  readonly filename?: string;
}

export function transform(source: string, options?: TransformOptions): TransformResult {
  const parsed = parseSource(source, options?.filename ?? 'source.ts');

  if (typeof parsed === 'string') {
    return { output: source, edits: 0, parseError: parsed };
  }

  const editList = buildEditsFromAST(source, parsed);
  const output = applyEdits(source, editList);

  return { output, edits: editList.length, parseError: null };
}
