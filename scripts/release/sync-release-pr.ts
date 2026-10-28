import { $ } from 'bun';

export interface SyncReleasePROptions {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly syncCommand: string;
}

export async function runSyncReleasePR(options: SyncReleasePROptions): Promise<void> {
  const shell = (command: $.ShellPromise) => command.cwd(options.cwd).env({ ...options.env });

  await shell($`bash -c ${options.syncCommand}`);

  // git diff --quiet exits 1 when the tree changed, and with a higher code when it cannot run.
  const diff = await shell($`git diff --quiet`).nothrow();

  if (diff.exitCode === 0) {
    console.log('The sync command changed nothing; the release PR stays as it is.');

    return;
  }

  if (diff.exitCode !== 1) {
    throw new Error(`git diff failed: ${diff.stderr.toString().trim()}`);
  }

  await shell($`git config user.name ${'github-actions[bot]'}`);
  await shell($`git config user.email ${'41898282+github-actions[bot]@users.noreply.github.com'}`);
  await shell($`git commit -am ${'chore: sync lockfile and format release files'}`);
  await shell($`git push`);
}

if (import.meta.main) {
  await runSyncReleasePR({
    cwd: process.cwd(),
    env: process.env,
    syncCommand: process.env['SYNC_COMMAND'] ?? '',
  });
}
