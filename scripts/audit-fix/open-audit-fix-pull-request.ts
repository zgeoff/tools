import { readFile, writeFile } from 'node:fs/promises';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { buildAuditFixPaths } from './build-audit-fix-paths.ts';
import { planAuditFixPullRequest } from './plan-audit-fix-pull-request.ts';
import { readOpenPullRequest } from './read-open-pull-request.ts';

export interface AuditFixPullRequestOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runnerTemp: string;
  readonly base: string;
  readonly defaultBranch: string;
  readonly isAutomerge: boolean;
  readonly runURL: string;
  readonly runCommand: RunCommand;
  readonly writeOutput: (text: string) => void;
}

export async function openAuditFixPullRequest(options: AuditFixPullRequestOptions): Promise<void> {
  const paths = buildAuditFixPaths(options.runnerTemp, options.base, options.defaultBranch);
  const commandOptions = { cwd: options.cwd, env: options.env };
  const gh = (args: readonly string[]) => options.runCommand(['gh', ...args], commandOptions);

  const checkedGH = (args: readonly string[]) =>
    runCheckedCommand(options.runCommand, ['gh', ...args], commandOptions);

  const titleText = await readFile(paths.title, 'utf8');
  const body = await readFile(paths.body, 'utf8');
  const reviewText = await readFile(paths.review, 'utf8');

  const title = titleText.replace(/\n+$/u, '');

  await writeFile(paths.pullRequestBody, `${body}\n[Workflow run](${options.runURL})\n`);

  const openNumber = await readOpenPullRequest({
    ...commandOptions,
    branch: paths.branch,
    runCommand: options.runCommand,
  });

  const plan = planAuditFixPullRequest({
    needsReview: reviewText.trim() === 'true',
    openNumber,
    isAutomerge: options.isAutomerge,
  });

  // A label the repo already has keeps its colour and description, so a refused create is fine.
  for (const label of plan.labels) {
    await gh(['label', 'create', label]);
  }

  const labelList = plan.labels.join(',');
  const bodyFile = ['--body-file', paths.pullRequestBody];

  if (plan.write.kind === 'create') {
    await checkedGH([
      'pr',
      'create',
      '--base',
      options.base,
      '--head',
      paths.branch,
      '--title',
      title,
      ...bodyFile,
      '--label',
      labelList,
    ]);
  } else {
    const number = String(plan.write.number);

    await checkedGH([
      'pr',
      'edit',
      number,
      '--title',
      title,
      ...bodyFile,
      '--add-label',
      labelList,
    ]);

    if (plan.write.removesIgnoreLabel) {
      await gh(['pr', 'edit', number, '--remove-label', 'audit-ignore']);
    }
  }

  if (plan.waitsForReview) {
    options.writeOutput(
      "The pull request adds or renews an ignore, so it waits for a person's review.\n",
    );
  }

  if (!plan.turnsAutoMergeOn) {
    return;
  }

  const merge = await gh(['pr', 'merge', paths.branch, '--auto', '--squash']);

  if (merge.exitCode !== 0) {
    options.writeOutput(
      '::warning::GitHub refused auto-merge; allow auto-merge in the repo settings, or merge the pull request by hand.\n',
    );
  }
}

if (import.meta.main) {
  const env = process.env;

  await openAuditFixPullRequest({
    cwd: process.cwd(),
    env,
    runnerTemp: env['RUNNER_TEMP'] ?? '',
    base: env['BASE'] ?? '',
    defaultBranch: env['DEFAULT_BRANCH'] ?? '',
    isAutomerge: env['AUTOMERGE'] === 'true',
    runURL: env['RUN_URL'] ?? '',
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
