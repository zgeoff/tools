import type { SpawnOptions } from './browser/process-runtime.ts';
import type { ReadCommandOutput } from './read-command-output.ts';

export interface GitPrefixDeps {
  readonly readCommandOutput: ReadCommandOutput;
}

// Returns the folder's path inside its repo as git prints it, with a trailing slash, or an empty
// string at the repo's top level.
export async function readGitPrefix(
  folder: string,
  environment: SpawnOptions['environment'],
  deps: GitPrefixDeps,
): Promise<string> {
  const output = await deps.readCommandOutput(['git', 'rev-parse', '--show-prefix'], {
    cwd: folder,
    environment,
  });

  if (output.exitCode !== 0) {
    throw new Error(
      `git rev-parse --show-prefix failed in ${folder} with exit code ${output.exitCode}`,
    );
  }

  return output.stdout.trim();
}
