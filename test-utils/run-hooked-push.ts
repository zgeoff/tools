import { $ } from 'bun';
import { collectFailedHookJobs } from './collect-failed-hook-jobs.ts';
import type { GitEnv } from './read-git-env.ts';

export interface HookedPush {
  readonly exitCode: number;

  // The push's stdout and stderr together, where lefthook prints each job.
  readonly output: string;

  readonly failedJobs: string[];
}

// Pushes the ref to origin from the work tree, which runs the repo's pre-push hook.
export async function runHookedPush(
  worktree: string,
  ref: string,
  env: GitEnv,
): Promise<HookedPush> {
  const result = await $`git push origin ${ref}`
    .cwd(worktree)
    .env({ ...env })
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  return { exitCode: result.exitCode, output, failedJobs: collectFailedHookJobs(output) };
}
