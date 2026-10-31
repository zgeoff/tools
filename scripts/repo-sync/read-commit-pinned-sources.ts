import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { readPinnedSources } from './read-pinned-sources.ts';

export interface CommitPinnedSourcesReading {
  readonly runCommand: RunCommand;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;

  // The checkout of zgeoff/tools, relative to cwd, that holds the commit.
  readonly repository: string;

  readonly commit: string;
}

// The pinned sources of one commit of zgeoff/tools, read from its tree.
export async function readCommitPinnedSources(
  reading: Readonly<CommitPinnedSourcesReading>,
): Promise<string[]> {
  const listed = await runGit(reading, [
    'ls-tree',
    '-z',
    '--name-only',
    reading.commit,
    '.github/workflows/',
  ]);

  return readPinnedSources({
    workflowPaths: splitPaths(listed.stdout),
    readFile: (path) => readCommitFile(reading, path),
  });
}

async function runGit(
  reading: Readonly<CommitPinnedSourcesReading>,
  args: readonly string[],
): Promise<CommandResult> {
  const argv = ['git', '-C', reading.repository, ...args];

  const result = await reading.runCommand(argv, { cwd: reading.cwd, env: reading.env });

  if (result.exitCode !== 0) {
    throw new Error(`${argv.join(' ')} exited with ${result.exitCode}: ${result.stderr.trim()}`);
  }

  return result;
}

function splitPaths(stdout: string): string[] {
  return stdout.split('\0').filter((path) => path !== '');
}

// A blobless checkout holds every tree but fetches a blob on demand, so the tree answers whether
// the path exists, and a failed read of a listed path fails with git's error, never as absent.
async function readCommitFile(
  reading: Readonly<CommitPinnedSourcesReading>,
  path: string,
): Promise<string | null> {
  const listed = await runGit(reading, [
    'ls-tree',
    '-z',
    '--name-only',
    reading.commit,
    '--',
    path,
  ]);

  if (splitPaths(listed.stdout).length === 0) {
    return null;
  }

  const shown = await runGit(reading, ['show', `${reading.commit}:${path}`]);

  return shown.stdout;
}
