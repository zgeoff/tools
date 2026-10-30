import type { GitEnv } from './read-git-env.ts';
import { readGitHead } from './read-git-head.ts';
import { runGit } from './run-git.ts';
import { writeTreeFiles } from './write-tree-files.ts';

// Commits even when nothing changed, and returns the new commit.
export async function createGitCommit(
  repo: string,
  env: GitEnv,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  await writeTreeFiles(repo, files);
  await runGit(repo, env, ['add', '-A']);
  await runGit(repo, env, ['commit', '--quiet', '--allow-empty', '-m', 'change']);

  return readGitHead(repo, env);
}
