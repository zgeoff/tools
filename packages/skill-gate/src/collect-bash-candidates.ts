import type { BashCandidates, FileHashes } from './types.ts';

// Collects the paths to hash after a Bash command: those the record holds and the gated paths git
// lists now. A listed path the record lacks was clean before, so its old content is in HEAD.
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
