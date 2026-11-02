import type { GitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

export interface GitCommitMove {
  // The commit to move, the commit the checkout resets to, and the bare repo it creates as origin.
  readonly commit: string;
  readonly keep: string;
  readonly remote: string;
}

// Pushes the commit to main of a new origin remote and prunes it from the checkout, so a reader
// of the checkout must fetch it to know it.
export async function moveGitCommitToRemote(
  repo: string,
  env: GitEnv,
  move: Readonly<GitCommitMove>,
): Promise<void> {
  await runGit(repo, env, ['init', '--quiet', '--bare', '-b', 'main', move.remote]);
  await runGit(repo, env, ['remote', 'add', 'origin', move.remote]);
  await runGit(repo, env, ['push', '--quiet', 'origin', `${move.commit}:refs/heads/main`]);
  await runGit(repo, env, ['reset', '--quiet', '--hard', move.keep]);
  await runGit(repo, env, ['update-ref', '-d', 'refs/remotes/origin/main']);
  await runGit(repo, env, ['reflog', 'expire', '--expire=now', '--all']);
  await runGit(repo, env, ['gc', '--quiet', '--prune=now']);
}
