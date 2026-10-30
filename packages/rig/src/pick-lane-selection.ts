import type { ResolvedLane } from './types.ts';

// bun test reads a bare argument as a filter on the path, so a suffix filter picks the lane's files
// and a ./ path picks a folder.
export function pickLaneSelection(
  lane: ResolvedLane,
  e2eDirs: readonly string[],
): readonly string[] {
  if (lane.suffix === null) {
    return e2eDirs.map((directory) => `./${directory}/`);
  }

  return [`${lane.suffix}.test.ts`, `${lane.suffix}.test.tsx`];
}
