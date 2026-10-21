import type { GitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';
import { writeTreeFiles } from './write-tree-files.ts';

export async function createGitCommit(
  repo: string,
  env: GitEnv,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await writeTreeFiles(repo, files);
  await runGit(repo, env, ['add', '-A']);
  await runGit(repo, env, ['commit', '--quiet', '-m', 'change']);
}
