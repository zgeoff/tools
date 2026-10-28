import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { runLoggedCommand } from '../ci/run-logged-command.ts';

export interface SyncReleasePROptions {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly syncCommand: string;

  // Runs git diff, whose exit code the sync reads.
  readonly runCommand: RunCommand;

  // Runs the sync command and the commit and push, whose output the log shows as each writes it.
  readonly runLoggedCommand: RunCommand;

  readonly writeOutput: (text: string) => void;
}

export async function runSyncReleasePR(options: SyncReleasePROptions): Promise<void> {
  const commandOptions = { cwd: options.cwd, env: options.env };

  const run = (argv: readonly string[]) =>
    runCheckedCommand(options.runLoggedCommand, argv, commandOptions);

  await run(['bash', '-c', options.syncCommand]);

  // git diff --quiet exits 1 when the tree changed, and with a higher code when it cannot run.
  const diff = await options.runCommand(['git', 'diff', '--quiet'], commandOptions);

  if (diff.exitCode === 0) {
    options.writeOutput('The sync command changed nothing; the release PR stays as it is.\n');

    return;
  }

  if (diff.exitCode !== 1) {
    throw new Error(`git diff failed: ${diff.stderr.trim()}`);
  }

  await run(['git', 'config', 'user.name', 'github-actions[bot]']);

  await run([
    'git',
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);

  await run(['git', 'commit', '-am', 'chore: sync lockfile and format release files']);
  await run(['git', 'push']);
}

if (import.meta.main) {
  await runSyncReleasePR({
    cwd: process.cwd(),
    env: process.env,
    syncCommand: process.env['SYNC_COMMAND'] ?? '',
    runCommand,
    runLoggedCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
