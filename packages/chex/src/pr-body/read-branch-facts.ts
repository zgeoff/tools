import type { RunProgram } from '../program/run-program.ts';
import type { DocPathspecs } from './read-doc-pathspecs.ts';
import type { BranchFacts, ShaState } from './types.ts';

interface BranchFactsOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runProgram: RunProgram;
  readonly pathspecs: DocPathspecs;
  readonly base: string;
  readonly head: string;

  // The commit hashes whose state the caller wants.
  readonly shas: readonly string[];
}

// The two pathspec groups run apart because the README group excludes the skill folders that the
// docs group lists.
export function readBranchFacts(options: Readonly<BranchFactsOptions>): BranchFacts {
  const groups = [options.pathspecs.readmes, options.pathspecs.docs];

  const docFiles = [
    ...new Set(
      groups.flatMap((group) =>
        splitPaths(
          runGit(options, [
            'diff',
            '--name-only',
            '-z',
            '--no-renames',
            `${options.base}...${options.head}`,
            '--',
            ...group,
          ]),
        ),
      ),
    ),
  ];

  const newestCommit = readNewestCommit(options, groups);

  const newestDocChange =
    newestCommit === undefined
      ? undefined
      : {
          commit: newestCommit,
          files: [
            ...new Set(
              groups.flatMap((group) =>
                splitPaths(
                  runGit(options, [
                    'diff',
                    '--name-only',
                    '-z',
                    '--no-renames',
                    `${newestCommit}^`,
                    newestCommit,
                    '--',
                    ...group,
                  ]),
                ),
              ),
            ),
          ],
        };

  return {
    docFiles,
    newestDocChange,
    shaStates: Object.fromEntries(
      options.shas.map((sha) => [sha, probeSha(options, newestCommit, sha)]),
    ),
  };
}

function splitPaths(output: string): string[] {
  return output.split('\0').filter((path) => path !== '');
}

function runGit(options: Readonly<BranchFactsOptions>, args: readonly string[]): string {
  const result = options.runProgram(['git', ...args], { cwd: options.cwd, env: options.env });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

function readNewestCommit(
  options: Readonly<BranchFactsOptions>,
  groups: readonly (readonly string[])[],
): string | undefined {
  const range = `${options.base}..${options.head}`;

  const touching = groups.flatMap((group) =>
    runGit(options, ['rev-list', '-1', range, '--', ...group])
      .split('\n')
      .filter((line) => line !== ''),
  );

  if (touching.length === 0) {
    return undefined;
  }

  // rev-list prints the newest commit first.
  const ordered = runGit(options, ['rev-list', range]).split('\n');

  return touching.toSorted((first, second) => ordered.indexOf(first) - ordered.indexOf(second))[0];
}

function probeSha(
  options: Readonly<BranchFactsOptions>,
  newestCommit: string | undefined,
  sha: string,
): ShaState {
  const resolved = options.runProgram(
    ['git', 'rev-parse', '--verify', '--quiet', `${sha}^{commit}`],
    { cwd: options.cwd, env: options.env },
  );

  if (resolved.exitCode !== 0) {
    return 'unknown';
  }

  const commit = resolved.stdout.trim();

  if (!probeAncestor(options, commit, options.head)) {
    return 'outside';
  }

  return newestCommit === undefined || probeAncestor(options, newestCommit, commit)
    ? 'current'
    : 'old';
}

// merge-base exits 1 for "not an ancestor" and with other codes when git fails.
function probeAncestor(
  options: Readonly<BranchFactsOptions>,
  ancestor: string,
  descendant: string,
): boolean {
  const result = options.runProgram(['git', 'merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: options.cwd,
    env: options.env,
  });

  if (result.exitCode > 1) {
    throw new Error(`git merge-base failed: ${result.stderr.trim()}`);
  }

  return result.exitCode === 0;
}
