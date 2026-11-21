import { createTempDir } from '../fs/create-temp-dir.ts';
import type { CleanupMode, TempDir } from '../fs/types.ts';
import type { GitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

// Makes an empty bare repo. Git refuses a push to the checked-out branch of a repo with a work
// tree, and an empty bare repo accepts any history as the first push.
export async function createGitOrigin(
  env: GitEnv,
  options: { readonly cleanup?: CleanupMode } = {},
): Promise<TempDir> {
  const origin = createTempDir('origin', options);

  try {
    await runGit(origin.path, env, ['init', '--quiet', '--bare', '-b', 'main']);

    // A push runs git on the origin side without the GIT_CONFIG_* variables.
    await runGit(origin.path, env, ['config', 'maintenance.auto', 'false']);
  } catch (error) {
    origin.remove();
    throw error;
  }

  return origin;
}
