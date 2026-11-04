import { runGit } from '@zgeoff/testing/helpers';
import type { GitEnv } from '@zgeoff/testing/helpers';

// Stages every change in the work tree and commits it with the message, which runs the repo's
// commit hooks.
export async function commitAllFiles(repo: string, env: GitEnv, message: string): Promise<void> {
  await runGit(repo, env, ['add', '-A']);
  await runGit(repo, env, ['commit', '--quiet', '-m', message]);
}
