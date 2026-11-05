// Returns git's own answer, which is relative to the repo root in the main checkout and absolute in
// a linked worktree.
export async function readGitCommonDir(repoRoot: string): Promise<string> {
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

  return output.trim();
}
