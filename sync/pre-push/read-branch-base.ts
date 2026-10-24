export interface ReadBranchBaseOptions {
  readonly cwd: string;

  // The whole environment of the git runs; left out, they inherit this process's.
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export async function readBranchBase(options: Readonly<ReadBranchBaseOptions>): Promise<string> {
  const head = await runGit(options, ['rev-parse', '--abbrev-ref', 'origin/HEAD']);

  // A clone made before origin/HEAD existed, and a CI checkout, have no symbolic ref.
  const defaultBranch = head.exitCode === 0 ? head.stdout.trim() : 'origin/main';

  const base = await runGit(options, ['merge-base', 'HEAD', defaultBranch]);

  if (base.exitCode !== 0) {
    throw new Error(
      `cannot find the base of this branch: no merge base between HEAD and ${defaultBranch} (is the remote fetched?)`,
    );
  }

  return base.stdout.trim();
}

async function runGit(options: Readonly<ReadBranchBaseOptions>, args: readonly string[]) {
  const subprocess = Bun.spawn(['git', ...args], {
    cwd: options.cwd,
    ...(options.env === undefined ? {} : { env: { ...options.env } }),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });

  const [stdout, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    subprocess.exited,
  ]);

  return { exitCode, stdout };
}
