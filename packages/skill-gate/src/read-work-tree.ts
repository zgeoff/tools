import path from 'node:path';
import { GitError } from 'simple-git';
import type { SimpleGit } from 'simple-git';
import type { WorkTree } from './types.ts';

// Reads, through a git client opened on the directory, the commit HEAD names, null before the first
// commit, and the absolute paths git status lists as changed, staged or untracked, with each
// rename's old path too. Null outside a work tree.
export async function readWorkTree(git: SimpleGit, directory: string): Promise<WorkTree | null> {
  try {
    // --show-toplevel resolves symlinks, so a project reached through one would match no path.
    const toRoot = await git.revparse(['--show-cdup']);
    const status = await git.status();
    const head = await git.revparse(['--verify', 'HEAD']).catch(() => null);

    const dirtyPaths = status.files
      .flatMap((file) => (file.from === undefined ? [file.path] : [file.path, file.from]))
      .map((entry) => path.join(directory, toRoot.trim(), entry));

    return { head: head?.trim() ?? null, dirtyPaths };
  } catch (error) {
    if (error instanceof GitError) {
      return null;
    }

    throw error;
  }
}
