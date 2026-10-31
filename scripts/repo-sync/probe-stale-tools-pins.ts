import { readCommitPinnedSources } from './read-commit-pinned-sources.ts';
import type { SyncCommandContext } from './write-sync-auto-merge.ts';

// The caller runs each reusable workflow at the commit it pins, so a pin whose pinned sources
// differ from the commit's runs older workflow code even when every entry matches.
export async function probeStaleToolsPins(
  context: SyncCommandContext,
  commit: string,
): Promise<boolean> {
  const pattern = String.raw`zgeoff/tools/\.github/workflows/[^@[:space:]]+@[0-9a-f]{40}`;
  const argv = ['git', 'grep', '-h', '-o', '-E', pattern, 'HEAD', '--', '.github/workflows'];

  const found = await context.runCommand(argv, { cwd: context.cwd, env: context.env });

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

async function probePinnedSourcesChanged(
  context: SyncCommandContext,
  pin: string,
  commit: string,
): Promise<boolean> {
  // A pin the checkout of zgeoff/tools lacks is unknown to it until fetched.
  await context.runCommand(['git', '-C', '.repo-sync', 'fetch', '-q', 'origin', pin], {
    cwd: context.cwd,
    env: context.env,
  });

  const tools = {
    runCommand: context.runCommand,
    cwd: context.cwd,
    env: context.env,
    repository: '.repo-sync',
  };

  const sources = new Set([
    ...(await readCommitPinnedSources({ ...tools, commit: pin })),
    ...(await readCommitPinnedSources({ ...tools, commit })),
  ]);

  const argv = ['git', '-C', '.repo-sync', 'diff', '--quiet', '--no-renames', pin, commit, '--'];

  const diff = await context.runCommand([...argv, ...sources], {
    cwd: context.cwd,
    env: context.env,
  });

  if (diff.exitCode > 1) {
    throw new Error(`${argv.join(' ')} exited with ${diff.exitCode}: ${diff.stderr}`);
  }

  return diff.exitCode === 1;
}
