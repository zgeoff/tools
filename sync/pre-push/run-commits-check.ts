import { join } from 'node:path';
import { readBranchBase } from './read-branch-base.ts';

export interface CommitsCheckOptions {
  readonly cwd: string;

  // The commit the branch grows from; the check reads the commits after it, up to HEAD.
  readonly base: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  // The paths of the commitlint program and of the @zgeoff/commitlint-config module.
  readonly commitlint: string;
  readonly config: string;
}

// --config replaces any commitlint config the repo keeps, so every repo that runs the check lints
// with the same rules.
export function runCommitsCheck(options: Readonly<CommitsCheckOptions>): string[] {
  return readBranchCommits(options).flatMap((commit) => {
    const result = runProgram(
      options,
      [options.commitlint, '--config', options.config, '--color=false'],
      commit.message,
    );

    return parseCommitlintOutput(commit.hash, result);
  });
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
  const cwd = process.cwd();

  const commitlint = Bun.which('commitlint', {
    PATH: `${join(cwd, 'node_modules/.bin')}:${process.env['PATH'] ?? ''}`,
  });

  if (commitlint === null) {
    writeSkipNotice(
      'the repo does not install commitlint; add @commitlint/cli and @zgeoff/commitlint-config as devDependencies to run it',
    );

    return;
  }

  const config = resolveCommitlintConfig(cwd);

  if (config === null) {
    writeSkipNotice(
      'the repo does not install @zgeoff/commitlint-config; add it as a devDependency to run it',
    );

    return;
  }

  try {
    const base = await readBranchBase({ cwd });

    const problems = runCommitsCheck({ cwd, base, env: process.env, commitlint, config });

    for (const problem of problems) {
      process.stdout.write(`${problem}\n`);
    }

    process.exitCode = problems.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`commits: ${error instanceof Error ? error.message : String(error)}\n`);

    process.exitCode = 2;
  }
}

function resolveCommitlintConfig(cwd: string): string | null {
  try {
    return Bun.resolveSync('@zgeoff/commitlint-config', cwd);
  } catch {
    return null;
  }
}

function writeSkipNotice(reason: string): void {
  // GitHub Actions shows a line that starts with ::notice:: on the run's summary.
  const prefix = process.env['GITHUB_ACTIONS'] === 'true' ? '::notice::' : '';

  process.stdout.write(`${prefix}commits: skipped, because ${reason}\n`);
}

if (import.meta.main) {
  await runCLI();
}
