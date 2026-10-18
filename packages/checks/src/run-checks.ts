import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { CheckConfig } from './load-config.ts';
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

// Runs each check that the config leaves on over the files that match its glob, and returns every
// finding, sorted by path and line within each check.
export async function runChecks(options: Readonly<RunChecksOptions>): Promise<CheckFinding[]> {
  const files = (options.files ?? collectTrackedFiles(options))
    .map((file) => toRepoPath(options.cwd, file))
    .filter((file) => existsSync(resolve(options.cwd, file)));

  const findings: CheckFinding[] = [];

  for (const check of options.checks) {
    if (options.config.off.has(check.name)) {
      continue;
    }

    const glob = new Bun.Glob(check.glob);

    const matched = files.filter((file) => glob.match(file));

    if (matched.length === 0) {
      continue;
    }

    const checkFindings = await check.check({ cwd: options.cwd, files: matched, env: options.env });

    findings.push(
      ...checkFindings
        .toSorted((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
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

function collectTrackedFiles(options: Readonly<RunChecksOptions>): string[] {
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
