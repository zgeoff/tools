import { lstat, readlink } from 'node:fs/promises';

export async function readFileContent(filePath: string): Promise<Uint8Array | null> {
  try {
    const stats = await lstat(filePath);

    // git stores a symlink as its link text, so a dangling link still has content to hash.
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
