import path from 'node:path';
import type { SimpleGit } from 'simple-git';

export async function readCommittedPaths(
  git: SimpleGit,
  directory: string,
  from: string | null,
  to: string,
): Promise<readonly string[]> {
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
}
