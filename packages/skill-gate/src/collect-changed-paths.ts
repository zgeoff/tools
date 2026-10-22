import type { FileHashes } from './types.ts';

// Collects the paths whose content after a Bash command differs from before it. The record holds
// the paths dirty before; any other path had its content at HEAD, and a path missing from both
// held no file.
export function collectChangedPaths(
  recorded: FileHashes,
  atHead: FileHashes,
  after: FileHashes,
): readonly string[] {
  return Object.keys(after).filter(
    (relativePath) => pickBeforeHash(recorded, atHead, relativePath) !== after[relativePath],
  );
}

function pickBeforeHash(
  recorded: FileHashes,
  atHead: FileHashes,
  relativePath: string,
): string | null {
  if (Object.hasOwn(recorded, relativePath)) {
    return recorded[relativePath] ?? null;
  }

  return Object.hasOwn(atHead, relativePath) ? (atHead[relativePath] ?? null) : null;
}
