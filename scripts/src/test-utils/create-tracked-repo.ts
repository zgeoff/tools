import { readGitEnv, runGit, writeTreeFiles } from '@zgeoff/testing/helpers';

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
