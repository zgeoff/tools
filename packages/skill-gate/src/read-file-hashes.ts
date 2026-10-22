import path from 'node:path';
import { toContentHash } from './to-content-hash.ts';
import type { FileHashes, ReadFileContent } from './types.ts';

// Reads, through the given content reader, a hash of each project path's content, or null for a
// path that holds no content.
export async function readFileHashes(
  readContent: ReadFileContent,
  projectDir: string,
  relativePaths: readonly string[],
): Promise<FileHashes> {
  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const content = await readContent(path.join(projectDir, relativePath));

      return [relativePath, content === null ? null : toContentHash(content)] as const;
    }),
  );

  return Object.fromEntries(entries);
}
