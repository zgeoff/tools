import type { CommandResult } from '../ci/run-command.ts';
import { readPinnedSources } from './read-pinned-sources.ts';
import type { SyncCommandContext } from './write-sync-auto-merge.ts';

// The caller runs each reusable workflow at the commit it pins, so a pin whose pinned sources differ
// from the commit's runs older workflow code even when every entry matches.
export async function probeStaleToolsPins(
  context: SyncCommandContext,
  commit: string,
): Promise<boolean> {
  const found = await runProbe(context, [
    'git',
    'grep',
    '-h',
    '-o',
    '-E',
    String.raw`zgeoff/tools/\.github/workflows/[^@[:space:]]+@[0-9a-f]{40}`,
    'HEAD',
    '--',
    '.github/workflows',
  ]);

  // git grep exits 1 when nothing matches and above 1 when it cannot read the tree.
  if (found.exitCode > 1) {
    throw new Error(
      `git grep for the zgeoff/tools pins exited with ${found.exitCode}: ${found.stderr}`,
    );
  }

  const pins = new Set(
    [...found.stdout.matchAll(/@(?<commit>[0-9a-f]{40})/gu)].flatMap((match) => {
      const pin = match.groups?.['commit'];

      return pin === undefined || pin === commit ? [] : [pin];
    }),
  );

  for (const pin of pins) {
    const isStale = await probePinnedSourcesChanged(context, pin, commit);

    if (isStale) {
      return true;
    }
  }

  return false;
}

function runProbe(context: SyncCommandContext, argv: readonly string[]): Promise<CommandResult> {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}

async function probePinnedSourcesChanged(
  context: SyncCommandContext,
  pin: string,
  commit: string,
): Promise<boolean> {
  // A pin the checkout of zgeoff/tools lacks is unknown to it until fetched.
  await runProbe(context, ['git', '-C', '.repo-sync', 'fetch', '-q', 'origin', pin]);

  const sources = new Set([
    ...(await readCommitPinnedSources(context, pin)),
    ...(await readCommitPinnedSources(context, commit)),
  ]);

  const argv = ['git', '-C', '.repo-sync', 'diff', '--quiet', '--no-renames', pin, commit, '--'];

  const diff = await runProbe(context, [...argv, ...sources]);

  if (diff.exitCode > 1) {
    throw new Error(`${argv.join(' ')} exited with ${diff.exitCode}: ${diff.stderr}`);
  }

  return diff.exitCode === 1;
}

async function readCommitPinnedSources(
  context: SyncCommandContext,
  commit: string,
): Promise<string[]> {
  const listed = await runProbe(context, [
    'git',
    '-C',
    '.repo-sync',
    'ls-tree',
    '-z',
    '--name-only',
    commit,
    '.github/workflows/',
  ]);

  if (listed.exitCode !== 0) {
    throw new Error(`git ls-tree of ${commit} exited with ${listed.exitCode}: ${listed.stderr}`);
  }

  return readPinnedSources({
    workflowPaths: listed.stdout.split('\0').filter((path) => path !== ''),
    readFile: async (path) => {
      const shown = await runProbe(context, [
        'git',
        '-C',
        '.repo-sync',
        'show',
        `${commit}:${path}`,
      ]);

      return shown.exitCode === 0 ? shown.stdout : null;
    },
  });
}
