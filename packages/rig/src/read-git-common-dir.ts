import type { SpawnOptions } from './browser/process-runtime.ts';
import type { ReadCommandOutput } from './read-command-output.ts';

export interface GitCommonDirDeps {
  readonly readCommandOutput: ReadCommandOutput;
}

// Returns git's own answer: in the main checkout it is relative to the folder git runs in, such as
// ../../.git from a package folder, and in a linked worktree it is absolute.
export async function readGitCommonDir(
  repoRoot: string,
  environment: SpawnOptions['environment'],
  deps: GitCommonDirDeps,
): Promise<string> {
  const output = await deps.readCommandOutput(['git', 'rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
    environment,
  });

  if (output.exitCode !== 0) {
    throw new Error(
      `git rev-parse --git-common-dir failed in ${repoRoot} with exit code ${output.exitCode}`,
    );
  }

  return output.stdout.trim();
}
