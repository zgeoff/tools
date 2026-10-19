import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// the nearest ancestor holding `.git` (a directory, or a worktree's file), or
// null outside a repository
export default function resolveRepoRoot(filename) {
  let directory = dirname(filename);

  while (!existsSync(join(directory, '.git'))) {
    const parent = dirname(directory);

    if (parent === directory) {
      return null;
    }

    directory = parent;
  }

  return directory;
}
