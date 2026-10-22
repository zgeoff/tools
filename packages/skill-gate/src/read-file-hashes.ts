import path from 'node:path';
import { toContentHash } from './to-content-hash.ts';
import type { FileHashes } from './types.ts';

// Reads a hash of each project path's content, or null for a path that holds no readable file.
export async function readFileHashes(
  projectDir: string,
  relativePaths: readonly string[],
): Promise<FileHashes> {
  const entries = await Promise.all(
    relativePaths.map(
      async (relativePath) =>
        [relativePath, await readFileHash(path.join(projectDir, relativePath))] as const,
    ),
  );

  return Object.fromEntries(entries);
}

async function readFileHash(filePath: string): Promise<string | null> {
  try {
    const bytes = await Bun.file(filePath).bytes();

    return toContentHash(bytes);
  } catch {
    // A deleted path, or one git lists as a folder such as a submodule, has no content to hash.
    return null;
  }
}
