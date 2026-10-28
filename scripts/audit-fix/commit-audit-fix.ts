import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { buildAuditFixPaths } from './build-audit-fix-paths.ts';
import { readOpenPullRequest } from './read-open-pull-request.ts';

export interface AuditFixCommitOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runnerTemp: string;
  readonly base: string;
  readonly defaultBranch: string;
  readonly outputPath: string;
  readonly fileSystem: FileSystem;
  readonly runCommand: RunCommand;
  readonly writeOutput: (text: string) => void;
}

// Returns the exit code, and writes pushed=true when the fix branch holds a change to open a pull
// request for.
export async function commitAuditFix(options: AuditFixCommitOptions): Promise<number> {
  const paths = buildAuditFixPaths(options.runnerTemp, options.base, options.defaultBranch);
  const commandOptions = { cwd: options.cwd, env: options.env };

  const git = (args: readonly string[]) =>
    runCheckedCommand(options.runCommand, ['git', ...args], commandOptions);

  const tryGit = (args: readonly string[]) => options.runCommand(['git', ...args], commandOptions);

  await git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  await git(['config', 'user.name', 'github-actions[bot]']);
  await git(['checkout', '-B', paths.branch]);
  await git(['add', '-A']);

  const staged = await tryGit(['diff', '--cached', '--quiet']);

  if (staged.exitCode === 0) {
    options.writeOutput('bun audit passes with nothing to change; nothing to fix.\n');

    // Deleting the branch closes a stale pull request; a branch that is already gone is fine.
    await tryGit(['push', 'origin', '--delete', paths.branch]);
    await writeStepOutputs(options.fileSystem, options.outputPath, { pushed: 'false' });

    return 0;
  }

  const title = await readTextFile(options.fileSystem, paths.title);

  if (title.trim() === '') {
    options.writeOutput('::error::audit-fix changed files but wrote no pull-request title\n');

    return 1;
  }

  await git(['commit', '-m', title.replace(/\n+$/u, '')]);

  // An ignore must not ride an auto-merge armed for an earlier fix, so auto-merge goes off before
  // the push.
  const needsReview = await readReviewFlag(options.fileSystem, paths.review);

  const openNumber = needsReview
    ? await readOpenPullRequest({
        ...commandOptions,
        branch: paths.branch,
        runCommand: options.runCommand,
      })
    : null;

  if (openNumber !== null) {
    await options.runCommand(['gh', 'pr', 'merge', paths.branch, '--disable-auto'], commandOptions);
  }

  // A rerun on an unchanged base makes the same tree; pushing it again would only restart the pull
  // request's checks.
  const isSameTree = await probeSameTree(options, paths.branch);

  if (isSameTree) {
    options.writeOutput('The open fix already holds this change.\n');
  } else {
    await git(['push', '--force', 'origin', paths.branch]);
  }

  await writeStepOutputs(options.fileSystem, options.outputPath, { pushed: 'true' });

  return 0;
}

async function readTextFile(fileSystem: FileSystem, path: string): Promise<string> {
  const exists = await fileSystem.probePath(path);

  return exists ? fileSystem.readText(path) : '';
}

async function readReviewFlag(fileSystem: FileSystem, path: string): Promise<boolean> {
  const text = await fileSystem.readText(path);

  return text.trim() === 'true';
}

async function probeSameTree(options: AuditFixCommitOptions, branch: string): Promise<boolean> {
  const git = (args: readonly string[]) =>
    options.runCommand(['git', ...args], { cwd: options.cwd, env: options.env });

  const fetched = await git(['fetch', '--quiet', 'origin', branch]);

  if (fetched.exitCode !== 0) {
    return false;
  }

  const head = await git(['rev-parse', 'HEAD^{tree}']);
  const remote = await git(['rev-parse', 'FETCH_HEAD^{tree}']);

  return head.stdout === remote.stdout;
}

if (import.meta.main) {
  process.exitCode = await commitAuditFix({
    cwd: process.cwd(),
    env: process.env,
    runnerTemp: process.env['RUNNER_TEMP'] ?? '',
    base: process.env['BASE'] ?? '',
    defaultBranch: process.env['DEFAULT_BRANCH'] ?? '',
    outputPath: process.env['GITHUB_OUTPUT'] ?? '',
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
