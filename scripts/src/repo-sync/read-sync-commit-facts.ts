import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult } from '../ci/run-command.ts';
import type { PinOrder, PinsReading, SyncCommitFacts } from './pick-sync-commit-verdict.ts';
import type { SyncCommandContext } from './write-sync-auto-merge.ts';

export interface SyncCommitRequest {
  // The commit of zgeoff/tools the run syncs from, checked out at .repo-sync with its history.
  readonly commit: string;

  // The sync branch, whose open pull request may already sync a newer commit.
  readonly branch: string;

  // The branch the caller checked out, whose workflows may already pin a newer commit.
  readonly base: string;
}

export async function readSyncCommitFacts(
  context: SyncCommandContext,
  request: Readonly<SyncCommitRequest>,
): Promise<SyncCommitFacts> {
  const onMain = await runProbe(context, [
    'git',
    '-C',
    '.repo-sync',
    'merge-base',
    '--is-ancestor',
    request.commit,
    'refs/remotes/origin/main',
  ]);

  // A run can wait in its queue while a newer sync pull request merges, so the checkout's own head
  // can be older than the base.
  const basePins = await readRemotePins(context, request.commit, request.base);

  const listed = await runCheckedCommand(
    context.runCommand,
    [
      'gh',
      'pr',
      'list',
      '--head',
      request.branch,
      '--state',
      'open',
      '--json',
      'number',
      '--jq',
      '.[0].number // empty',
    ],
    { cwd: context.cwd, env: context.env },
  );

  const number = listed.stdout.trim();

  const pullRequest =
    number === ''
      ? null
      : {
          number,
          branch: request.branch,
          pins: await readRemotePins(context, request.commit, request.branch),
        };

  return {
    commit: request.commit,
    isOnMain: onMain.exitCode === 0,
    base: request.base,
    basePins,
    pullRequest,
  };
}

function runProbe(context: SyncCommandContext, argv: readonly string[]): Promise<CommandResult> {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}

async function readRemotePins(
  context: SyncCommandContext,
  commit: string,
  ref: string,
): Promise<PinsReading> {
  const fetched = await runProbe(context, ['git', 'fetch', '-q', 'origin', ref]);

  if (fetched.exitCode !== 0) {
    return { kind: 'unreadable', reason: fetched.stderr.trim() };
  }

  return readTreePins(context, commit);
}

async function readTreePins(context: SyncCommandContext, commit: string): Promise<PinsReading> {
  const found = await runProbe(context, [
    'git',
    'grep',
    '-h',
    '-o',
    '-E',
    String.raw`zgeoff/tools/\.github/workflows/[^@[:space:]]+@[0-9a-f]{40}`,
    'FETCH_HEAD',
    '--',
    '.github/workflows',
  ]);

  // git grep exits 1 when nothing matches and above 1 when it cannot read the tree.
  if (found.exitCode > 1) {
    return { kind: 'unreadable', reason: found.stderr.trim() };
  }

  const pinned = [...found.stdout.matchAll(/@(?<commit>[0-9a-f]{40})/gu)].flatMap((match) => {
    const pin = match.groups?.['commit'];

    return pin === undefined ? [] : [pin];
  });

  const pins: PinOrder[] = [];

  for (const pin of new Set(pinned)) {
    const order = await readPinOrder(context, commit, pin);

    pins.push(order);
  }

  return { kind: 'read', pins };
}

async function readPinOrder(
  context: SyncCommandContext,
  commit: string,
  pin: string,
): Promise<PinOrder> {
  if (pin === commit) {
    return { pin, order: 'not-newer' };
  }

  // A pin newer than the checkout of zgeoff/tools is unknown to it until fetched.
  await runProbe(context, ['git', '-C', '.repo-sync', 'fetch', '-q', 'origin', pin]);

  const older = await runProbe(context, [
    'git',
    '-C',
    '.repo-sync',
    'merge-base',
    '--is-ancestor',
    commit,
    pin,
  ]);

  // merge-base exits 1 when the commit is not an ancestor and above 1 when it lacks an object.
  if (older.exitCode > 1) {
    return { pin, order: 'unknown', reason: older.stderr.trim() };
  }

  const order = older.exitCode === 0 ? 'newer' : 'not-newer';

  return { pin, order };
}
