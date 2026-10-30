import { createGitCommit } from './create-git-commit.ts';
import type { GitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

// Commits the files and pushes the commit to main of the origin remote, and returns the commit.
export async function createPushedGitCommit(
  repo: string,
  env: GitEnv,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const commit = await createGitCommit(repo, env, files);

  await runGit(repo, env, ['push', '--quiet', 'origin', 'HEAD:main']);

  return commit;
}
