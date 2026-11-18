import { join, resolve } from 'node:path';

// The folder sits in the git folder, which git never lists as untracked, and in the common one, so
// a run from a linked worktree shares one place with the main checkout.
export function buildBenchFolderPath(repoRoot: string, gitCommonDir: string): string {
  return join(resolve(repoRoot, gitCommonDir), 'rig-bench');
}
