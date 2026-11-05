import { join } from 'node:path';
import { buildBenchFolderPath } from './build-bench-folder-path.ts';

export interface BenchWorkFolderDeps {
  // Returns what `git rev-parse --git-common-dir` prints in the repo root.
  readonly readGitCommonDir: (repoRoot: string) => Promise<string>;

  // Makes the folder and its parents, and keeps a folder that exists.
  readonly createFolder: (path: string) => Promise<void>;

  // Makes a new folder whose path starts with the prefix, and returns its path.
  readonly createTempFolder: (prefix: string) => Promise<string>;
}

export async function createBenchWorkFolder(
  repoRoot: string,
  deps: BenchWorkFolderDeps,
): Promise<string> {
  const gitCommonDir = await deps.readGitCommonDir(repoRoot);

  const benchFolder = buildBenchFolderPath(repoRoot, gitCommonDir);

  await deps.createFolder(benchFolder);

  return deps.createTempFolder(join(benchFolder, 'run-'));
}
