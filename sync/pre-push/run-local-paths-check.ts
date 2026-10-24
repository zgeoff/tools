import { hostname } from 'node:os';
import { parseAddedLines } from './parse-added-lines.ts';
import { readBranchBase } from './read-branch-base.ts';
import type { RunProgram } from './run-program.ts';
import { runProgram } from './run-program.ts';

export interface LocalPathsCheckOptions {
  readonly cwd: string;

  readonly base: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly host: string;

  readonly runProgram: RunProgram;
}

export interface LocalPathFinding {
  // Relative to the repo root.
  readonly path: string;

  // The line's number in the file as the commit that adds it leaves it.
  readonly line: number;

  readonly message: string;
}

// Every commit is read, because a later commit that removes the line still pushes the one that adds
// it.
export function runLocalPathsCheck(options: Readonly<LocalPathsCheckOptions>): LocalPathFinding[] {
  const home = findHomePrefix(options.env['HOME']);
  const host = findHostPattern(options.host);

  if (home === null && host === null) {
    return [];
  }

  const result = options.runProgram(
    [
      'git',
      '-c',
      'core.quotePath=false',
      'log',
      '-p',
      '-U0',
      '-M',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',

      // A merge shows the lines its author adds beyond git's own merge, such as a conflict's
      // resolution; the lines it brings from either parent come from commits the log reads anyway.
      '--diff-merges=remerge',
      '--format=%x00%h',
      `${options.base}..HEAD`,
    ],
    { cwd: options.cwd, env: options.env },
  );

  if (result.exitCode !== 0) {
    throw new Error(`git log failed: ${result.stderr.trim()}`);
  }

  return parseAddedLines(result.stdout).flatMap((added) => {
    const findings: LocalPathFinding[] = [];

    if (home !== null && added.text.includes(home)) {
      findings.push({
        path: added.path,
        line: added.line,
        message: `commit ${added.hash} adds the home directory ${home}; remove it before you push`,
      });
    }

    if (host !== null && host.pattern.test(added.text)) {
      findings.push({
        path: added.path,
        line: added.line,
        message: `commit ${added.hash} adds the host name ${host.name}; remove it before you push`,
      });
    }

    return findings;
  });
}

// A trailing slash keeps `/home/ada` from matching `/home/adam`, and a home of `/` would match
// every URL.
function findHomePrefix(home: string | undefined): string | null {
  const trimmed = home?.replace(/\/+$/u, '') ?? '';

  return trimmed === '' ? null : `${trimmed}/`;
}

// A whole word, as `grep -w` reads one. `localhost` is in every repo's configs.
function findHostPattern(name: string): { name: string; pattern: RegExp } | null {
  if (name === '' || name === 'localhost') {
    return null;
  }

  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

  return { name, pattern: new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'u') };
}

async function runCLI(): Promise<void> {
  try {
    const base = await readBranchBase({ cwd: process.cwd() });

    const findings = runLocalPathsCheck({
      cwd: process.cwd(),
      base,
      env: process.env,
      host: hostname(),
      runProgram,
    });

    for (const finding of findings) {
      process.stdout.write(`${finding.path}:${finding.line}: ${finding.message}\n`);
    }

    process.exitCode = findings.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `local-paths: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await runCLI();
}
