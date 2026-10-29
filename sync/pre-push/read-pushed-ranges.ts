import { parseArgs } from 'node:util';
import { readBranchBase, readDefaultBranch } from './read-branch-base.ts';
import type { RunProgram } from './run-program.ts';

// The revisions of one `git rev-list` call, such as `['<local sha>', '^origin/main']`.
export type CommitRange = readonly string[];

export interface PushedRef {
  readonly localSha: string;

  // Null when the push creates the remote ref.
  readonly remoteSha: string | null;
}

export interface GitOptions {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly runProgram: RunProgram;
}

export interface PushedRangesOptions extends GitOptions {
  // The lines git hands a pre-push hook on stdin, or null outside a push.
  readonly pushedRefs: string | null;
}

const zeroSha = /^0+$/u;

// git writes one `<local ref> <local sha> <remote ref> <remote sha>` line per ref it pushes.
export function parsePushedRefs(text: string): PushedRef[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      const [, localSha, , remoteSha] = line.trim().split(' ');

      if (localSha === undefined || remoteSha === undefined) {
        throw new Error(`cannot read the pushed ref line: ${line}`);
      }

      // A push that deletes the remote ref sends no commit.
      if (zeroSha.test(localSha)) {
        return [];
      }

      return [{ localSha, remoteSha: zeroSha.test(remoteSha) ? null : remoteSha }];
    });
}

export function readPushedRanges(options: Readonly<PushedRangesOptions>): CommitRange[] {
  if (options.pushedRefs === null) {
    const base = readBranchBase(options);

    return [[`${base}..HEAD`]];
  }

  const refs = parsePushedRefs(options.pushedRefs);

  if (refs.length === 0) {
    return [];
  }

  const defaultBranch = readDefaultBranch(options);

  if (!probeCommitPresent(options, defaultBranch)) {
    throw new Error(
      `cannot find origin's default branch: ${defaultBranch} is not a commit (is the remote fetched?)`,
    );
  }

  return refs.map((ref) =>
    ref.remoteSha !== null && probeCommitPresent(options, ref.remoteSha)
      ? [ref.localSha, `^${defaultBranch}`, `^${ref.remoteSha}`]
      : [ref.localSha, `^${defaultBranch}`],
  );
}

// Two ranges can share a commit, such as two branches that start from the same one, and git log
// cannot read a union of ranges, so each range is listed apart and each commit kept once.
export function readRangeCommits(
  options: Readonly<GitOptions>,
  ranges: readonly CommitRange[],
): string[] {
  const commits = ranges.flatMap((range) => {
    const argv = ['git', 'rev-list', ...range];
    const result = options.runProgram(argv, { cwd: options.cwd, env: options.env });

    if (result.exitCode !== 0) {
      throw new Error(`${argv.join(' ')} failed: ${result.stderr.trim()}`);
    }

    return result.stdout.split('\n').filter((line) => line !== '');
  });

  return [...new Set(commits)];
}

export function formatCommitLines(commits: readonly string[]): string {
  return commits.map((commit) => `${commit}\n`).join('');
}

// A remote ref that another clone moved points at a commit this clone may lack.
function probeCommitPresent(options: Readonly<GitOptions>, revision: string): boolean {
  const result = options.runProgram(['git', 'cat-file', '-e', `${revision}^{commit}`], {
    cwd: options.cwd,
    env: options.env,
  });

  return result.exitCode === 0;
}

// Only a hook that passes `--pushed-refs` hands over stdin; a manual run leaves stdin a terminal,
// where a read waits for input.
export async function readPushedRefsInput(args: readonly string[]): Promise<string | null> {
  const parsed = parseArgs({
    args: [...args],
    options: { 'pushed-refs': { type: 'boolean' } },
    strict: true,
  });

  return parsed.values['pushed-refs'] === true ? await Bun.stdin.text() : null;
}
