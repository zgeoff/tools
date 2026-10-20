export function runGitMergeBase(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const head = runGit(cwd, env, ['rev-parse', '--abbrev-ref', 'origin/HEAD']);

  // A clone made before origin/HEAD existed, and a CI checkout, have no symbolic ref.
  const defaultBranch = head.exitCode === 0 ? head.stdout.trim() : 'origin/main';
  const base = runGit(cwd, env, ['merge-base', 'HEAD', defaultBranch]);

  if (base.exitCode !== 0) {
    throw new Error(
      `cannot find the base of this branch: no merge base between HEAD and ${defaultBranch} (is the remote fetched?)`,
    );
  }

  return base.stdout.trim();
}

function runGit(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
  args: readonly string[],
) {
  const result = Bun.spawnSync(['git', ...args], {
    cwd,
    env: { ...env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}
