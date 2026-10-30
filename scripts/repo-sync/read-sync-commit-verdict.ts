import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult } from '../ci/run-command.ts';
import type { SyncCommandContext } from './write-sync-auto-merge.ts';

export interface SyncCommitRequest {
  // The commit of zgeoff/tools the run syncs from, checked out at .repo-sync with its history.
  readonly commit: string;

  // The sync branch, whose open pull request may already sync a newer commit.
  readonly branch: string;
}

export type SyncCommitVerdict =
  | { readonly kind: 'current' }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'superseded'; readonly number: string; readonly pin: string };

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

  const pin = await readBranchPin(context, request.branch);

  if (pin === null || pin === request.commit) {
    return { kind: 'current' };
  }

  const older = await runProbe(context, [
    'git',
    '-C',
    '.repo-sync',
    'merge-base',
    '--is-ancestor',
    request.commit,
    pin,
  ]);

  return older.exitCode === 0 ? { kind: 'superseded', number, pin } : { kind: 'current' };
}

function runProbe(context: SyncCommandContext, argv: readonly string[]): Promise<CommandResult> {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}

// The commit that the open sync branch pins its zgeoff/tools workflow calls to, or null when the
// branch pins none.
async function readBranchPin(context: SyncCommandContext, branch: string): Promise<string | null> {
  const fetched = await runProbe(context, ['git', 'fetch', '-q', 'origin', branch]);

  if (fetched.exitCode !== 0) {
    return null;
  }

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

  const pin = /@(?<commit>[0-9a-f]{40})/u.exec(found.stdout)?.groups?.['commit'];

  return pin ?? null;
}
