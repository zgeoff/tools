import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';

export interface SyncReleasePROptions {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly syncCommand: string;

  readonly runCommand: RunCommand;

  readonly writeOutput: (text: string) => void;
}

export async function runSyncReleasePR(options: SyncReleasePROptions): Promise<void> {
  const commandOptions = { cwd: options.cwd, env: options.env };

  // Each command's output reaches the step log once the command ends.
  const run = async (argv: readonly string[]) => {
    const result = await runCheckedCommand(options.runCommand, argv, commandOptions);

    const text = `${result.stdout}${result.stderr}`;

    if (text !== '') {
      options.writeOutput(text);
    }
  };

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
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
