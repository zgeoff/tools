import { statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { match } from 'ts-pattern';
import type { CheckConfig } from './load-config.ts';
import { runGitMergeBase } from './run-git-merge-base.ts';
import type { Check, Finding } from './types.ts';

export interface RunChecksOptions {
  // The repo root.
  readonly cwd: string;

  readonly checks: readonly Check[];
  readonly config: CheckConfig;

  // The files to check; left out, every file that git tracks.
  readonly files?: readonly string[];

  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface CheckFinding extends Finding {
  readonly check: string;
}

// Runs each check that the config leaves on: a file check over the files that match its glob, and a
// branch check over the commits since the branch's base. It returns every finding, sorted by path
// and line within each check.
export async function runChecks(options: Readonly<RunChecksOptions>): Promise<CheckFinding[]> {
  const files = (options.files ?? runGitLsFiles(options))
    .map((file) => toRepoPath(options.cwd, file))
    .filter((file) => checkPathExists(options.cwd, file));

  const findings: CheckFinding[] = [];

  // The base is found once, and only when a branch check is on, so a repo that turns every branch
  // check off runs without a fetched remote.
  let base: string | undefined;
  const readBranchBase = () => (base ??= runGitMergeBase(options.cwd, options.env));

  for (const check of options.checks) {
    if (options.config.off.has(check.name)) {
      continue;
    }

    const checkFindings = await match(check)
      .with({ kind: 'files' }, (fileCheck) => {
        const glob = new Bun.Glob(fileCheck.glob);

        const matched = files.filter((file) => glob.match(file));

        return matched.length === 0
          ? []
          : fileCheck.check({ cwd: options.cwd, files: matched, env: options.env });
      })
      .with({ kind: 'branch' }, (branchCheck) =>
        branchCheck.check({ cwd: options.cwd, base: readBranchBase(), env: options.env }),
      )
      .exhaustive();

    findings.push(
      ...checkFindings
        .toSorted(
          (first, second) => first.path.localeCompare(second.path) || first.line - second.line,
        )
        .map((finding) => ({
          check: check.name,
          path: finding.path,
          line: finding.line,
          message: finding.message,
        })),
    );
  }

  return findings;
}

function runGitLsFiles(options: Readonly<RunChecksOptions>): string[] {
  const result = Bun.spawnSync(['git', 'ls-files', '-z'], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr.toString().trim()}`);
  }

  return result.stdout
    .toString()
    .split('\0')
    .filter((file) => file !== '');
}

// A path the caller gives, such as ./scripts/a.sh, as the repo-relative path a glob matches.
function toRepoPath(cwd: string, file: string): string {
  const path = relative(cwd, resolve(cwd, file));

  return isAbsolute(path) ? file : path;
}

// A listed path that no longer exists, such as a file the branch deletes, is skipped. Any other
// error, such as a folder the runner cannot enter, throws, so the run never passes over a file it
// could not read.
function checkPathExists(cwd: string, file: string): boolean {
  try {
    statSync(resolve(cwd, file));
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return false;
    }

    throw error;
  }

  return true;
}
