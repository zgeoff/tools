import { join } from 'node:path';
import { readBranchBase } from './read-branch-base.ts';

export interface CommitsCheckOptions {
  // The repo root, whose node_modules holds commitlint and @zgeoff/commitlint-config.
  readonly cwd: string;

  // The commit the branch grows from; the check reads the commits after it, up to HEAD.
  readonly base: string;

  readonly env: Readonly<Record<string, string | undefined>>;
}

export type CommitsCheck =
  | { readonly kind: 'skipped'; readonly reason: string }
  | { readonly kind: 'checked'; readonly problems: readonly string[] };

// --config replaces any commitlint config the repo keeps, so every repo that runs the check lints
// with the same rules.
export function runCommitsCheck(options: Readonly<CommitsCheckOptions>): CommitsCheck {
  const commitlint = Bun.which('commitlint', {
    PATH: `${join(options.cwd, 'node_modules/.bin')}:${options.env['PATH'] ?? ''}`,
  });

  if (commitlint === null) {
    return {
      kind: 'skipped',
      reason:
        'the repo does not install commitlint; add @commitlint/cli and @zgeoff/commitlint-config as devDependencies to run it',
    };
  }

  const config = resolveCommitlintConfig(options.cwd);

  if (config === null) {
    return {
      kind: 'skipped',
      reason:
        'the repo does not install @zgeoff/commitlint-config; add it as a devDependency to run it',
    };
  }

  const problems = readBranchCommits(options).flatMap((commit) => {
    const result = runProgram(
      options,
      [commitlint, '--config', config, '--color=false'],
      commit.message,
    );

    return parseCommitlintOutput(commit.hash, result);
  });

  return { kind: 'checked', problems };
}

function resolveCommitlintConfig(cwd: string): string | null {
  try {
    return Bun.resolveSync('@zgeoff/commitlint-config', cwd);
  } catch {
    return null;
  }
}

interface Commit {
  readonly hash: string;
  readonly message: string;
}

// A merge commit carries the message git wrote, so the check leaves it out.
function readBranchCommits(options: Readonly<CommitsCheckOptions>): Commit[] {
  const result = runProgram(options, [
    'git',
    'log',
    '--no-merges',
    '-z',
    '--format=%h%n%B',
    `${options.base}..HEAD`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`git log failed: ${result.stderr.trim()}`);
  }

  return result.stdout
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => {
      const newline = entry.indexOf('\n');

      return { hash: entry.slice(0, newline), message: entry.slice(newline + 1) };
    });
}

interface ProgramResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runProgram(
  options: Readonly<CommitsCheckOptions>,
  argv: readonly string[],
  stdin?: string,
): ProgramResult {
  const result = Bun.spawnSync([...argv], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: stdin === undefined ? 'ignore' : Buffer.from(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function parseCommitlintOutput(hash: string, result: ProgramResult): string[] {
  // The default formatter: `✖   subject may not be empty [subject-empty]`. The summary line,
  // `✖   found 1 problems, 0 warnings`, ends with no rule name.
  const problemLine = /^✖\s+(?<message>.+ \[[\w-]+\])$/u;

  // commitlint exits 1 when it reports a problem, and with other codes when it cannot run, such as
  // 9 for a config with no rules.
  if (result.exitCode > 1) {
    throw new Error(`commitlint failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  const problems = result.stdout.split('\n').flatMap((line) => {
    const message = problemLine.exec(line)?.groups?.['message'];

    return message === undefined ? [] : [`commit ${hash}: ${message}`];
  });

  // An exit of 1 with no problem it could read is a crash, such as a config it cannot load.
  if (result.exitCode === 1 && problems.length === 0) {
    throw new Error(`commitlint failed: ${result.stderr.trim()}`);
  }

  return problems;
}

async function runCLI(): Promise<void> {
  try {
    const base = await readBranchBase({ cwd: process.cwd() });

    const check = runCommitsCheck({ cwd: process.cwd(), base, env: process.env });

    // A repo that takes this script need not install ts-pattern, so the union branches with an if.
    if (check.kind === 'skipped') {
      // GitHub Actions shows a line that starts with ::notice:: on the run's summary.
      const prefix = process.env['GITHUB_ACTIONS'] === 'true' ? '::notice::' : '';

      process.stdout.write(`${prefix}commits: skipped, because ${check.reason}\n`);

      return;
    }

    for (const problem of check.problems) {
      process.stdout.write(`${problem}\n`);
    }

    process.exitCode = check.problems.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`commits: ${error instanceof Error ? error.message : String(error)}\n`);

    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await runCLI();
}
