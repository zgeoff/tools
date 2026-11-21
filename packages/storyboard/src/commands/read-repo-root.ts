// The git root that holds `startDir`.
export function readRepoRoot(startDir: string): string {
  const result = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
    cwd: startDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    throw new Error(`${startDir} sits in no git repository`);
  }

  return result.stdout.toString().trim();
}
