import type { Edit } from '../types.ts';

export function applyEdits(source: string, edits: readonly Edit[]): string {
  const segments: string[] = [];
  let tail = source.length;

  for (const edit of edits) {
    segments.push(source.slice(edit.end, tail), edit.replacement);

    tail = edit.start;
  }

  segments.push(source.slice(0, tail));

  return segments.toReversed().join('');
}
