import { readFile, writeFile } from 'node:fs/promises';
import { $ } from 'bun';
import { buildAuditFixPaths } from './build-audit-fix-paths.ts';
import { readOpenPullRequest } from './read-open-pull-request.ts';

export interface AuditFixPullRequestOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runnerTemp: string;
  readonly base: string;
  readonly defaultBranch: string;
  readonly isAutomerge: boolean;
  readonly runURL: string;
  readonly writeOutput: (text: string) => void;
}

export async function openAuditFixPullRequest(options: AuditFixPullRequestOptions): Promise<void> {
  const paths = buildAuditFixPaths(options.runnerTemp, options.base, options.defaultBranch);
  const gh = (args: readonly string[]) => $`gh ${args}`.cwd(options.cwd).env({ ...options.env });

  const titleText = await readFile(paths.title, 'utf8');
  const body = await readFile(paths.body, 'utf8');
  const reviewText = await readFile(paths.review, 'utf8');

  const title = titleText.replace(/\n+$/u, '');
  const needsReview = reviewText.trim() === 'true';

  await writeFile(paths.pullRequestBody, `${body}\n[Workflow run](${options.runURL})\n`);

  const labels = ['dependencies', 'security', ...(needsReview ? ['audit-ignore'] : [])];

  // A label the repo already has keeps its colour and description, so a refused create is fine.
  for (const label of labels) {
    await gh(['label', 'create', label]).nothrow().quiet();
  }

  const number = await readOpenPullRequest({
    cwd: options.cwd,
    env: options.env,
    branch: paths.branch,
  });

  if (number === null) {
    await gh([
      'pr',
      'create',
      '--base',
      options.base,
      '--head',
      paths.branch,
      '--title',
      title,
      '--body-file',
      paths.pullRequestBody,
      '--label',
      labels.join(','),
    ]);
  } else {
    await gh([
      'pr',
      'edit',
      String(number),
      '--title',
      title,
      '--body-file',
      paths.pullRequestBody,
      '--add-label',
      labels.join(','),
    ]);

    if (!needsReview) {
      await gh(['pr', 'edit', String(number), '--remove-label', 'audit-ignore'])
        .nothrow()
        .quiet();
    }
  }

  if (needsReview) {
    options.writeOutput(
      "The pull request adds or renews an ignore, so it waits for a person's review.\n",
    );

    return;
  }

  if (!options.isAutomerge) {
    return;
  }

  const merge = await gh(['pr', 'merge', paths.branch, '--auto', '--squash']).nothrow();

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
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
