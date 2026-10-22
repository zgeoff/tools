import path from 'node:path';
import { GitError } from 'simple-git';
import type { SimpleGit } from 'simple-git';

// Reads, through a git client opened on the directory, the absolute paths that differ between two
// commits, a rename as its old and new path. With no first commit, it reads every path the second
// one holds. A comparison git cannot make reads no path.
export async function readCommittedPaths(
  git: SimpleGit,
  directory: string,
  from: string | null,
  to: string,
): Promise<readonly string[]> {
  try {
    const toRoot = await git.revparse(['--show-cdup']);

    const listArgs =
      from === null
        ? ['ls-tree', '-r', '--full-tree', '--name-only', '-z', to]
        : ['diff', '--name-only', '--no-renames', '-z', from, to];

    const names = await git.raw(listArgs);

    return names
      .split('\0')
      .filter((entry) => entry !== '')
      .map((entry) => path.join(directory, toRoot.trim(), entry));
  } catch (error) {
    if (error instanceof GitError) {
      return [];
    }

    throw error;
  }
}
