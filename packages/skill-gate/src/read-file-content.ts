import { lstat, readlink } from 'node:fs/promises';

// Reads a file's bytes, or a symlink's link text, which is what git stores for one, so a dangling
// link still has content. Null for a path that holds neither.
export async function readFileContent(filePath: string): Promise<Uint8Array | null> {
  try {
    const stats = await lstat(filePath);

    if (stats.isSymbolicLink()) {
      const target = await readlink(filePath);

      return new TextEncoder().encode(target);
    }

    return await Bun.file(filePath).bytes();
  } catch {
    // A deleted path, or one git lists as a folder such as a submodule, has no content to hash.
    return null;
  }
}
