// The top of the git work tree that holds `cwd`, so the runner reads the root config and prints
// root-relative paths from any folder in the repo. Outside a work tree, or without git, it is `cwd`
// itself, so a file list still runs there.
export function resolveRepoRoot(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (Bun.which('git', { PATH: env['PATH'] ?? '' }) === null) {
    return cwd;
  }

  const result = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
    cwd,
    env: { ...env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return result.exitCode === 0 ? result.stdout.toString().trim() : cwd;
}
