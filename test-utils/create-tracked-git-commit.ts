import { createGitCommit } from './create-git-commit.ts';
import type { GitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

// Commits the files and points refs/remotes/origin/main at the commit, as a checkout that pushed it
// to main would, with no remote; returns the commit.
export async function createTrackedGitCommit(
  repo: string,
  env: GitEnv,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const commit = await createGitCommit(repo, env, files);

  await runGit(repo, env, ['update-ref', 'refs/remotes/origin/main', commit]);

  return commit;
}
