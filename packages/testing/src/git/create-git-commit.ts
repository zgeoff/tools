import { writeTreeFiles } from '../fs/write-tree-files.ts';
import type { GitEnv } from './read-git-env.ts';
import { readGitHead } from './read-git-head.ts';
import { runGit } from './run-git.ts';
import type { TestCommit } from './types.ts';

// Writes, stages and commits the files, even when nothing changed, and returns the new commit.
export async function createGitCommit(
  repo: string,
  env: GitEnv,
  files: TestCommit['files'],
): Promise<string> {
  await writeTreeFiles(repo, files);
  await runGit(repo, env, ['add', '-A']);
  await runGit(repo, env, ['commit', '--quiet', '--allow-empty', '-m', 'change']);

  return readGitHead(repo, env);
}
