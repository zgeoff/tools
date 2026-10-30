import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult } from '../ci/run-command.ts';
import type { SyncCommandContext } from './write-sync-auto-merge.ts';

export interface SyncCommitRequest {
  // The commit of zgeoff/tools the run syncs from, checked out at .repo-sync with its history.
  readonly commit: string;

  // The sync branch, whose open pull request may already sync a newer commit.
  readonly branch: string;

  // The branch the caller checked out, whose workflows may already pin a newer commit.
  readonly base: string;
}

export type SyncCommitVerdict =
  | { readonly kind: 'current' }
  | { readonly kind: 'refused'; readonly message: string }
  | {
      readonly kind: 'superseded';

      // The base branch or the open pull request that already pins the newer commit.
      readonly holder: string;
      readonly pin: string;
    };

// Anyone who can push to the caller can send a dispatch, and GitHub serves a fork's commit through
// this repository, so only a commit on main may run its manifest's builds.
export async function readSyncCommitVerdict(
  context: SyncCommandContext,
  request: Readonly<SyncCommitRequest>,
): Promise<SyncCommitVerdict> {
  const onMain = await runProbe(context, [
    'git',
    '-C',
    '.repo-sync',
    'merge-base',
    '--is-ancestor',
    request.commit,
    'refs/remotes/origin/main',
  ]);

  if (onMain.exitCode !== 0) {
    return {
      kind: 'refused',
      message: `${request.commit} is not a commit on main of zgeoff/tools`,
    };
  }

  // A run can wait in its queue while a newer sync pull request merges, so the checkout's own head
  // can be older than the base.
  const fetchedBase = await runProbe(context, ['git', 'fetch', '-q', 'origin', request.base]);

  const baseTree = fetchedBase.exitCode === 0 ? 'FETCH_HEAD' : 'HEAD';

  const basePin = await readPin(context, baseTree);
  const isBaseNewer = await probeNewerPin(context, request.commit, basePin);

  if (isBaseNewer && basePin !== null) {
    return { kind: 'superseded', holder: request.base, pin: basePin };
  }

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

  if (number === '') {
    return { kind: 'current' };
  }

  const fetched = await runProbe(context, ['git', 'fetch', '-q', 'origin', request.branch]);

  const branchPin = fetched.exitCode === 0 ? await readPin(context, 'FETCH_HEAD') : null;

  const isBranchNewer = await probeNewerPin(context, request.commit, branchPin);

  return isBranchNewer && branchPin !== null
    ? { kind: 'superseded', holder: `Pull request #${number}`, pin: branchPin }
    : { kind: 'current' };
}

function runProbe(context: SyncCommandContext, argv: readonly string[]): Promise<CommandResult> {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}

// The commit that the tree's zgeoff/tools workflow calls pin, or null when it pins none.
async function readPin(context: SyncCommandContext, tree: string): Promise<string | null> {
  const found = await runProbe(context, [
    'git',
    'grep',
    '-h',
    '-o',
    '-E',
    String.raw`zgeoff/tools/\.github/workflows/[^@[:space:]]+@[0-9a-f]{40}`,
    tree,
    '--',
    '.github/workflows',
  ]);

  const pin = /@(?<commit>[0-9a-f]{40})/u.exec(found.stdout)?.groups?.['commit'];

  return pin ?? null;
}

// Whether the pin is a commit of zgeoff/tools that holds the commit and is not the commit itself.
async function probeNewerPin(
  context: SyncCommandContext,
  commit: string,
  pin: string | null,
): Promise<boolean> {
  if (pin === null || pin === commit) {
    return false;
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

  return older.exitCode === 0;
}
