import { readGitEnv } from '@zgeoff/std/test-utils/read-git-env';
import { runGit } from '@zgeoff/std/test-utils/run-git';
import { writeTreeFiles } from '@zgeoff/std/test-utils/write-tree-files';

// `git ls-files` lists a staged file, so the repo needs no commit for rig to see its files.
export async function createTrackedRepo(
  repoRoot: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  const env = readGitEnv(repoRoot);

  await writeTreeFiles(repoRoot, files);
  await runGit(repoRoot, env, ['init', '--quiet']);
  await runGit(repoRoot, env, ['add', '-A']);
}
