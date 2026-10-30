import { createGitCommit } from './create-git-commit.ts';
import type { GitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

export interface SideGitCommit {
  readonly branch: string;
  readonly files: Readonly<Record<string, string>>;
}

// Commits the files on a new branch and returns to the branch it left, so the commit exists and
// that branch never holds it; returns the commit.
export async function createSideGitCommit(
  repo: string,
  env: GitEnv,
  side: Readonly<SideGitCommit>,
): Promise<string> {
  await runGit(repo, env, ['switch', '--quiet', '-c', side.branch]);

  const commit = await createGitCommit(repo, env, side.files);

  await runGit(repo, env, ['switch', '--quiet', '-']);

  return commit;
}
