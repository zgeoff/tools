import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { runAuditFix } from './audit-fix.ts';
import { buildAuditFixPaths } from './build-audit-fix-paths.ts';

export interface AdvisoriesFixOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runnerTemp: string;
  readonly base: string;
  readonly defaultBranch: string;
  readonly expiryDays: string;
  readonly fileSystem: FileSystem;
  readonly runAuditFix: (argv: readonly string[]) => Promise<void>;
  readonly runCommand: RunCommand;
}

// An open fix branch's ignores keep their expiry on a rerun, so the rerun builds the same tree.
export async function fixAdvisories(options: AdvisoriesFixOptions): Promise<void> {
  const paths = buildAuditFixPaths(options.runnerTemp, options.base, options.defaultBranch);

  const hasPending = await copyPendingIgnores(options, paths.branch, paths.pendingIgnores);

  await options.runAuditFix([
    '--title-file',
    paths.title,
    '--body-file',
    paths.body,
    '--review-file',
    paths.review,
    '--expiry-days',
    options.expiryDays,
    ...(hasPending ? ['--pending-ignores', paths.pendingIgnores] : []),
  ]);
}

async function copyPendingIgnores(
  options: AdvisoriesFixOptions,
  branch: string,
  pendingPath: string,
): Promise<boolean> {
  const git = (args: readonly string[]) =>
    options.runCommand(['git', ...args], { cwd: options.cwd, env: options.env });

  const fetched = await git(['fetch', '--quiet', 'origin', branch]);

  if (fetched.exitCode !== 0) {
    return false;
  }

  const shown = await git(['show', 'FETCH_HEAD:audit-ignores.json']);

  if (shown.exitCode !== 0) {
    return false;
  }

  await options.fileSystem.writeText(pendingPath, shown.stdout);

  return true;
}

if (import.meta.main) {
  await fixAdvisories({
    cwd: process.cwd(),
    env: process.env,
    runnerTemp: process.env['RUNNER_TEMP'] ?? '',
    base: process.env['BASE'] ?? '',
    defaultBranch: process.env['DEFAULT_BRANCH'] ?? '',
    expiryDays: process.env['EXPIRY_DAYS'] ?? '30',
    fileSystem: nodeFileSystem,
    runAuditFix,
    runCommand,
  });
}
