import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { buildAuditFixPaths } from './build-audit-fix-paths.ts';
import { planAuditFixCommit } from './plan-audit-fix-commit.ts';
import { planAuditFixPush } from './plan-audit-fix-push.ts';
import { readOpenPullRequest } from './read-open-pull-request.ts';

export interface AuditFixCommitOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runnerTemp: string;
  readonly base: string;
  readonly defaultBranch: string;
  readonly outputPath: string;
  readonly fileSystem: Pick<FileSystem, 'appendText' | 'probePath' | 'readText'>;
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
  const titleText = await readTextFile(options.fileSystem, paths.title);
  const reviewText = await readTextFile(options.fileSystem, paths.review);

  const plan = planAuditFixCommit({
    hasStagedChange: staged.exitCode !== 0,
    titleText,
    reviewText,
  });

  writeLogLines(options, plan.logLines);

  if (plan.deletesBranch) {
    // A branch that is already gone is fine.
    await tryGit(['push', 'origin', '--delete', paths.branch]);
  }

  if (plan.pushedOutput !== null) {
    await writeStepOutputs(options.fileSystem, options.outputPath, { pushed: plan.pushedOutput });
  }

  if (plan.commitMessage === null) {
    return plan.exitCode;
  }

  await git(['commit', '-m', plan.commitMessage]);

  const openNumber = plan.readsOpenPullRequest
    ? await readOpenPullRequest({
        ...commandOptions,
        branch: paths.branch,
        runCommand: options.runCommand,
      })
    : null;

  const isSameTree = await probeSameTree(options, paths.branch);

  const push = planAuditFixPush({ openNumber, isSameTree });

  if (push.disablesAutoMerge) {
    await options.runCommand(['gh', 'pr', 'merge', paths.branch, '--disable-auto'], commandOptions);
  }

  if (push.pushes) {
    await git(['push', '--force', 'origin', paths.branch]);
  }

  writeLogLines(options, push.logLines);

  await writeStepOutputs(options.fileSystem, options.outputPath, { pushed: 'true' });

  return 0;
}

async function readTextFile(
  fileSystem: Pick<FileSystem, 'appendText' | 'probePath' | 'readText'>,
  path: string,
): Promise<string> {
  const exists = await fileSystem.probePath(path);

  return exists ? fileSystem.readText(path) : '';
}

function writeLogLines(options: AuditFixCommitOptions, lines: readonly string[]): void {
  for (const line of lines) {
    options.writeOutput(line);
  }
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
