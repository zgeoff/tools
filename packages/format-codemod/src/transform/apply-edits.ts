import type { Edit } from '../types.ts';

/**
 * Callers must pass edits sorted last-to-first, so each splice's offsets stay
 * valid without adjustment. Segments are collected and joined once instead of
 * re-copying the whole string per edit.
 */
export function applyEdits(src: string, edits: readonly Edit[]): string {
  const segments: string[] = [];
  let tail = src.length;

  for (const e of edits) {
    segments.push(src.slice(e.end, tail), e.replacement);
    tail = e.start;
  }

  segments.push(src.slice(0, tail));

  return segments.toReversed().join('');
}
