import type { CommitRange } from './types.ts';

export function pickCommitRange(before: string | null, after: string | null): CommitRange | null {
  if (after === null || before === after) {
    return null;
  }

  return { from: before, to: after };
}
