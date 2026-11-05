import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// The folder sits in the git folder, which git never lists as untracked, and in the common one, so
// a run from a linked worktree shares one place with the main checkout.
export async function createBenchWorkFolder(repoRoot: string): Promise<string> {
  const listing = Bun.spawn(['git', 'rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'inherit',
  });

  const [exitCode, output] = await Promise.all([
    listing.exited,
    new Response(listing.stdout).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `git rev-parse --git-common-dir failed in ${repoRoot} with exit code ${exitCode}`,
    );
  }

  const benchFolder = join(resolve(repoRoot, output.trim()), 'rig-bench');

  await mkdir(benchFolder, { recursive: true });

  return mkdtemp(join(benchFolder, 'run-'));
}
