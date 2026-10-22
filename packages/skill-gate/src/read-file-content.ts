// Reads a file's bytes, or null for a path that holds no file.
export async function readFileContent(filePath: string): Promise<Uint8Array | null> {
  try {
    return await Bun.file(filePath).bytes();
  } catch {
    // A deleted path, or one git lists as a folder such as a submodule, has no content to hash.
    return null;
  }
}
