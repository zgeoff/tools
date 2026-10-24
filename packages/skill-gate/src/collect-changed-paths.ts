import type { FileHashes } from './types.ts';

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
