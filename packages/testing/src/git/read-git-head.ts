import type { GitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

export async function readGitHead(repo: string, env: GitEnv): Promise<string> {
  const stdout = await runGit(repo, env, ['rev-parse', 'HEAD']);

  return stdout.trim();
}
