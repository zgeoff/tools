import { hostname } from 'node:os';
import { runProgram } from '../run-program.ts';
import type { BranchCheck, BranchCheckContext, Finding } from '../types.ts';
import { parseAddedLines } from './parse-added-lines.ts';

// The home directory and the host name of whoever runs the check, in any line a commit of the
// branch adds. Every commit is read, because a later commit that removes the line still pushes the
// one that adds it.
export const localPathsCheck: BranchCheck = {
  kind: 'branch',
  name: 'local-paths',
  check: checkLocalPaths,
};

function checkLocalPaths(context: BranchCheckContext): Finding[] {
  const home = findHomePrefix(context.env['HOME']);
  const host = findHostPattern(hostname());

  if (home === null && host === null) {
    return [];
  }

  const result = runProgram('local-paths', context, [
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
    `${context.base}..HEAD`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`local-paths: git log failed: ${result.stderr.trim()}`);
  }

  return parseAddedLines(result.stdout).flatMap((added) => {
    const findings: Finding[] = [];

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

// The home directory with a trailing slash, so `/home/ada` never matches `/home/adam`. A home of
// `/` would match every URL, so it is left out.
function findHomePrefix(home: string | undefined): string | null {
  const trimmed = home?.replace(/\/+$/u, '') ?? '';

  return trimmed === '' ? null : `${trimmed}/`;
}

// The host name as a whole word, as `grep -w` reads one. `localhost` is in every repo's configs, so
// it is left out.
function findHostPattern(name: string): { name: string; pattern: RegExp } | null {
  if (name === '' || name === 'localhost') {
    return null;
  }

  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

  return { name, pattern: new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'u') };
}
