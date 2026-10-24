import type { BashCandidates, FileHashes } from './types.ts';

export function collectBashCandidates(
  recorded: FileHashes,
  gatedPaths: readonly string[],
): BashCandidates {
  const cleanBefore = gatedPaths.filter((relativePath) => !Object.hasOwn(recorded, relativePath));

  return {
    hashedPaths: [...new Set([...Object.keys(recorded), ...gatedPaths])],
    cleanBefore: [...new Set(cleanBefore)],
  };
}
