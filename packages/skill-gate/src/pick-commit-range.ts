import type { CommitRange } from './types.ts';

// Picks the commits a Bash command moved HEAD between, or null when HEAD stayed or there is none.
export function pickCommitRange(before: string | null, after: string | null): CommitRange | null {
  if (after === null || before === after) {
    return null;
  }

  return { from: before, to: after };
}
