import path from 'node:path';
import { GitError, simpleGit } from 'simple-git';

// Reads the absolute paths that git status lists as changed, staged or untracked under a
// directory's work tree, with each rename's old path too, or null outside a work tree.
export async function readDirtyPaths(directory: string): Promise<readonly string[] | null> {
  try {
    const git = simpleGit(directory);

    // --show-toplevel resolves symlinks, so a project reached through one would match no path.
    const toRoot = await git.revparse(['--show-cdup']);
    const status = await git.status();

    return status.files
      .flatMap((file) => (file.from === undefined ? [file.path] : [file.path, file.from]))
      .map((entry) => path.join(directory, toRoot.trim(), entry));
  } catch (error) {
    if (error instanceof GitError) {
      return null;
    }

    throw error;
  }
}
