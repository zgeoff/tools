// Lists the files git tracks in the repo, so a lane and `rig init` look at what a push would
// carry, never at build output or an untracked scratch folder.
export async function readTrackedFiles(repoRoot: string): Promise<readonly string[]> {
  const listing = Bun.spawn(['git', 'ls-files', '-z'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'inherit',
  });

  const [exitCode, output] = await Promise.all([
    listing.exited,
    new Response(listing.stdout).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`git ls-files failed in ${repoRoot} with exit code ${exitCode}`);
  }

  return output.split('\0').filter((path) => path !== '');
}
