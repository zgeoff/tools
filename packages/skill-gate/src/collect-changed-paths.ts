import type { FileHashes } from './types.ts';

// Collects the paths whose content differs between two snapshots. A path missing from the first
// snapshot was clean then, so any entry the second one holds for it is a change.
export function collectChangedPaths(before: FileHashes, after: FileHashes): readonly string[] {
  return Object.keys(after).filter(
    (relativePath) =>
      !Object.hasOwn(before, relativePath) || before[relativePath] !== after[relativePath],
  );
}
