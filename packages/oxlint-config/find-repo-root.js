import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// the nearest ancestor holding `.git` (a directory, or a worktree's file), or
// null outside a repository
export default function findRepoRoot(filename) {
  let dir = dirname(filename);

  while (!existsSync(join(dir, '.git'))) {
    const parent = dirname(dir);

    if (parent === dir) {
      return null;
    }

    dir = parent;
  }

  return dir;
}
