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

  runMergeBlobsFetch(options);

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

// A blobless clone fetches a merge's missing blobs during the log, in one batch with the
// conflict-marked blob that the log builds in a temporary folder, and the server refuses the whole
// batch. Fetching the blobs first leaves the log nothing to ask for.
function runMergeBlobsFetch(options: Readonly<LocalPathsCheckOptions>): void {
  const promisor = options.runProgram(
    ['git', 'config', '--type=bool', '--get', 'remote.origin.promisor'],
    { cwd: options.cwd, env: options.env },
  );

  if (promisor.stdout.trim() !== 'true') {
    return;
  }

  const merges = splitLines(
    runGit(options, ['rev-list', '--merges', '--parents', `${options.base}..HEAD`]),
  );

  if (merges.length === 0) {
    return;
  }

  const pairs = merges.flatMap((merge) => {
    const commits = merge.split(' ');
    const argv = ['git', 'merge-base', '--all', ...commits.slice(1)];
    const bases = options.runProgram(argv, { cwd: options.cwd, env: options.env });

    // `git merge-base` exits 1 when the parents share no commit.
    if (bases.exitCode !== 0 && bases.exitCode !== 1) {
      throw new Error(`${argv.join(' ')} failed: ${bases.stderr.trim()}`);
    }

    return splitLines(bases.stdout).flatMap((base) =>
      commits.map((commit) => `${base} ${commit}\n`),
    );
  });

  const commits = new Set(pairs.flatMap((pair) => pair.trim().split(' ')));

  // A blob ID on the command line makes git 2.43's rev-list die when the blob is missing, so the
  // listing starts from the commits instead.
  const listing = runGit(
    options,
    ['rev-list', '--objects', '--missing=print', '--no-walk', '--stdin'],
    [...commits].map((commit) => `${commit}\n`).join(''),
  );

  const missing = new Set(
    splitLines(listing)
      .filter((line) => line.startsWith('?'))
      .map((line) => line.slice(1)),
  );

  // The server refuses the whole fetch when it asks for a blob that only this clone holds.
  const blobs = collectBlobIds(
    runGit(options, ['diff-tree', '-r', '--no-abbrev', '--stdin'], pairs.join('')),
  ).filter((blob) => missing.has(blob));

  if (blobs.length === 0) {
    return;
  }

  runGit(
    options,
    [
      '-c',
      'fetch.negotiationAlgorithm=noop',
      'fetch',
      '--quiet',
      '--no-tags',
      '--no-write-fetch-head',
      '--filter=blob:none',
      '--stdin',
      'origin',
    ],
    blobs.map((blob) => `${blob}\n`).join(''),
  );
}

function splitLines(text: string): string[] {
  return text.split('\n').filter((line) => line !== '');
}

function runGit(
  options: Readonly<LocalPathsCheckOptions>,
  args: readonly string[],
  stdin?: string,
): string {
  const argv = ['git', ...args];

  const result = options.runProgram(argv, {
    cwd: options.cwd,
    env: options.env,
    ...(stdin === undefined ? {} : { stdin }),
  });

  if (result.exitCode !== 0) {
    throw new Error(`${argv.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

// Each raw line reads `:<old mode> <new mode> <old id> <new id> <status>\t<path>`.
function collectBlobIds(rawDiff: string): string[] {
  const blobs = new Set<string>();

  for (const line of rawDiff.split('\n')) {
    if (!line.startsWith(':')) {
      continue;
    }

    const [oldMode, newMode, oldBlob, newBlob] = line.slice(1).split(' ');

    for (const [mode, blob] of [
      [oldMode, oldBlob],
      [newMode, newBlob],
    ]) {
      if (mode !== undefined && blob !== undefined && BLOB_MODES.has(mode)) {
        blobs.add(blob);
      }
    }
  }

  return [...blobs];
}

const BLOB_MODES = new Set(['100644', '100755', '120000']);

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
