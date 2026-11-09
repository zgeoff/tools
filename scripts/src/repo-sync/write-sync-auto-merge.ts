import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { collectUndeliveredPaths } from './collect-undelivered-paths.ts';

export interface SyncCommandContext {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runCommand: RunCommand;
  readonly writeOutput: (text: string) => void;
}

export interface SyncAutoMergeRequest {
  // The number of the pull request the run opened or updated.
  readonly number: string;

  // The branch the run synced from, and the commit of it that the sync branch starts from.
  readonly base: string;
  readonly start: string;

  // The targets the run copied and the retired copies it removed.
  readonly delivered: readonly string[];

  // Each package.json script that a build of the run writes, with the value it writes.
  readonly scripts: Readonly<Record<string, string>>;
}

const enableAutoMergeMutation =
  'mutation($pullRequestID: ID!, $head: GitObjectID!) { enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestID, mergeMethod: SQUASH, expectedHeadOid: $head }) { clientMutationId } }';

export async function writeSyncAutoMerge(
  context: SyncCommandContext,
  request: SyncAutoMergeRequest,
): Promise<void> {
  const viewed = await runChecked(context, [
    'gh',
    'pr',
    'view',
    request.number,
    '--json',
    'id,baseRefName',
    '--jq',
    String.raw`"\(.id) \(.baseRefName)"`,
  ]);

  const [pullRequestID = '', base = ''] = viewed.stdout.trim().split(' ');

  // The run diffs its branch against the commit it checked out, which is the pull request's base
  // only when the pull request merges into the branch the run synced from.
  if (base !== request.base) {
    context.writeOutput(
      `::warning::Pull request #${request.number} merges into ${base}, not ${request.base}, which the run synced from, so it waits for review.\n`,
    );

    return;
  }

  const head = await runChecked(context, ['git', 'rev-parse', 'HEAD']);

  const diff = await runChecked(context, [
    'git',
    'diff',
    '--name-only',
    '-z',
    '--no-renames',
    request.start,
    'HEAD',
  ]);

  const changed = diff.stdout.split('\0').filter((path) => path !== '');

  const packageJSON = changed.includes('package.json')
    ? await readPackageJSONChange(context, request.start)
    : null;

  const undelivered = collectUndeliveredPaths({
    changed,
    delivered: request.delivered,
    scripts: request.scripts,
    packageJSON,
  });

  if (undelivered.length > 0) {
    context.writeOutput(
      `::warning::Pull request #${request.number} changes files the manifest does not deliver, so it waits for review: ${undelivered.join(', ')}\n`,
    );

    return;
  }

  // gh pr merge --auto merges a pull request that can merge at once, before any check runs. The
  // mutation refuses one instead, so such a pull request waits for review.
  const armed = await runProbe(context, [
    'gh',
    'api',
    'graphql',
    '-f',
    `query=${enableAutoMergeMutation}`,
    '-f',
    `pullRequestID=${pullRequestID}`,
    '-f',
    `head=${head.stdout.trim()}`,
  ]);

  if (armed.exitCode !== 0) {
    context.writeOutput(
      `::warning::Auto-merge of pull request #${request.number} did not turn on, so it waits for review: ${armed.stderr.trim()}\n`,
    );

    return;
  }

  context.writeOutput(`Turned on auto-merge of pull request #${request.number}.\n`);
}

function runChecked(context: SyncCommandContext, argv: readonly string[]): Promise<CommandResult> {
  return runCheckedCommand(context.runCommand, argv, { cwd: context.cwd, env: context.env });
}

async function readPackageJSONChange(
  context: SyncCommandContext,
  start: string,
): Promise<{ before: string; after: string } | null> {
  const before = await runProbe(context, ['git', 'show', `${start}:package.json`]);
  const after = await runProbe(context, ['git', 'show', 'HEAD:package.json']);

  return before.exitCode === 0 && after.exitCode === 0
    ? { before: before.stdout, after: after.stdout }
    : null;
}

function runProbe(context: SyncCommandContext, argv: readonly string[]): Promise<CommandResult> {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}
