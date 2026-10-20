import { runProgram } from '../run-program.ts';
import type { BranchCheck, BranchCheckContext, Finding } from '../types.ts';
import { parseCommitlintOutput } from './parse-commitlint-output.ts';

// commitlint over the message of each commit the branch adds, with the rules of
// @zgeoff/commitlint-config. --config replaces any commitlint config the repo keeps, so every repo
// lints with the same rules.
export const commitsCheck: BranchCheck = {
  kind: 'branch',
  name: 'commits',
  check: checkCommits,
};

function checkCommits(context: BranchCheckContext): Finding[] {
  const commits = readBranchCommits(context);

  if (commits.length === 0) {
    return [];
  }

  const config = Bun.resolveSync('@zgeoff/commitlint-config', import.meta.dir);

  return commits.flatMap((commit) =>
    parseCommitlintOutput(
      commit.hash,
      runProgram(
        'commits',
        context,
        ['commitlint', '--config', config, '--color=false'],
        commit.message,
      ),
    ),
  );
}

interface Commit {
  readonly hash: string;
  readonly message: string;
}

// A merge commit carries the message git wrote, so the check leaves it out.
function readBranchCommits(context: BranchCheckContext): Commit[] {
  const result = runProgram('commits', context, [
    'git',
    'log',
    '--no-merges',
    '-z',
    '--format=%h%n%B',
    `${context.base}..HEAD`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`commits: git log failed: ${result.stderr.trim()}`);
  }

  return result.stdout
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => {
      const newline = entry.indexOf('\n');

      return { hash: entry.slice(0, newline), message: entry.slice(newline + 1) };
    });
}
