// Prints the files the branch changes since its merge base with origin's default
// branch, one per line. lefthook's {push_files} lists all of history for a branch
// with no upstream, so the pre-push baseline reads its file list from here.

interface CollectBranchFilesOptions {
  readonly cwd: string;

  // The whole environment of the git runs; left out, they inherit this process's.
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export async function collectBranchFiles(
  options: Readonly<CollectBranchFilesOptions>,
): Promise<string[]> {
  const head = await runGit(options, ['rev-parse', '--abbrev-ref', 'origin/HEAD']);

  // A clone made before origin/HEAD existed has no symbolic ref.
  const defaultBranch = head.exitCode === 0 ? head.stdout.trim() : 'origin/main';

  const base = await runGit(options, ['merge-base', 'HEAD', defaultBranch]);

  // Throw rather than list nothing, so a hook never checks nothing by accident.
  if (base.exitCode !== 0) {
    throw new Error(
      `cannot find the base of this branch: no merge base between HEAD and ${defaultBranch} (is the remote fetched?)`,
    );
  }

  const diff = await runGit(options, [
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=d',
    base.stdout.trim(),
    'HEAD',
  ]);

  if (diff.exitCode !== 0) {
    throw new Error(`git diff failed: ${diff.stderr.trim()}`);
  }

  return diff.stdout.split('\n').filter((line) => line !== '');
}

async function runGit(options: Readonly<CollectBranchFilesOptions>, args: readonly string[]) {
  const proc = Bun.spawn(['git', ...args], {
    cwd: options.cwd,
    ...(options.env === undefined ? {} : { env: { ...options.env } }),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

async function runCLI(): Promise<void> {
  try {
    const files = await collectBranchFiles({ cwd: process.cwd() });

    if (files.length > 0) {
      process.stdout.write(`${files.join('\n')}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `collect-branch-files: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    process.exit(1);
  }
}

if (import.meta.main) {
  await runCLI();
}
