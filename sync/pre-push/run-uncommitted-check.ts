import { readBranchFiles } from './read-branch-files.ts';
import type { RunProgram } from './run-program.ts';
import { runProgram } from './run-program.ts';

export interface UncommittedCheckOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;

  // The files the push sends or deletes, relative to the repo root.
  readonly files: readonly string[];

  readonly runProgram: RunProgram;
}

// The later checks read the disk, so a change to a pushed file that is not committed would hide a
// fault in the pushed commit. git status lists index, disk and untracked changes, such as a deleted
// file restored on disk, and it lists every path, so no file name reaches its argv.
export function runUncommittedCheck(options: Readonly<UncommittedCheckOptions>): string[] {
  const result = options.runProgram(
    ['git', 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'],
    { cwd: options.cwd, env: options.env },
  );

  if (result.exitCode !== 0) {
    throw new Error(`git status failed: ${result.stderr.trim()}`);
  }

  const files = new Set(options.files);

  // Each entry is two status letters, a space and the path.
  return result.stdout
    .split('\0')
    .map((entry) => entry.slice(3))
    .filter((path) => files.has(path));
}

async function runCLI(): Promise<void> {
  const cwd = process.cwd();

  try {
    const files = await readBranchFiles({ cwd, withDeleted: true });

    const changed = runUncommittedCheck({ cwd, env: process.env, files, runProgram });

    if (changed.length > 0) {
      process.stdout.write(
        `uncommitted: these files the branch changes hold a change that is not committed, so the checks would read a copy the push does not send; commit or stash it:\n${changed.join('\n')}\n`,
      );
    }

    process.exitCode = changed.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `uncommitted: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await runCLI();
}
