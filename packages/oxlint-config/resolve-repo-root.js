import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// `.git` is a file, not a directory, in a git worktree
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
