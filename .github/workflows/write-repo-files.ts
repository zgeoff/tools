import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Writes each file under `repo`, keyed by its repo-relative path, creating the folders it needs.
export async function writeRepoFiles(
  repo: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await writeFile(join(repo, path), content);
  }
}
