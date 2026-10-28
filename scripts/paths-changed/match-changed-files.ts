import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { runPathMatch } from './run-path-match.ts';

export interface ChangedFilesMatch {
  // The pull request's checkout, which the match reads only through git.
  readonly checkout: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly event: string;

  // One pattern per line, as in on.pull_request.paths.
  readonly patterns: string;

  readonly runCommand: RunCommand;
}

export interface ChangedFilesAnswer {
  readonly changed: boolean;

  // A line for each changed file and each pattern it matches.
  readonly matches: readonly string[];
}

// On any event but a pull request the answer is true, so a push runs every job in full.
export async function matchChangedFiles(
  match: Readonly<ChangedFilesMatch>,
): Promise<ChangedFilesAnswer> {
  if (match.event !== 'pull_request') {
    return { changed: true, matches: [] };
  }

  const files = await readMergeChangedFiles(match);

  const pathMatches = await runPathMatch({
    paths: files,
    patterns: match.patterns.split('\n').filter((pattern) => pattern !== ''),
    cwd: match.checkout,
    env: match.env,
    runCommand: match.runCommand,
  });

  const matches = pathMatches.map((pathMatch) => `${pathMatch.path} matches ${pathMatch.pattern}`);

  return { changed: matches.length > 0, matches };
}

// The merge commit against the base it merges into: what the merge changes. --no-renames lists a
// moved file's old path too, and -z leaves a path unquoted whatever its characters.
async function readMergeChangedFiles(match: Readonly<ChangedFilesMatch>): Promise<string[]> {
  const result = await runCheckedCommand(
    match.runCommand,
    ['git', 'diff', '-z', '--name-only', '--no-renames', 'HEAD^1', 'HEAD'],
    { cwd: match.checkout, env: match.env },
  );

  return result.stdout.split('\0').filter((file) => file !== '');
}

if (import.meta.main) {
  const answer = await matchChangedFiles({
    checkout: process.env['GITHUB_WORKSPACE'] ?? process.cwd(),
    env: process.env,
    event: process.env['EVENT'] ?? '',
    patterns: process.env['PATTERNS'] ?? '',
    runCommand,
  });

  for (const line of answer.matches) {
    process.stdout.write(`${line}\n`);
  }

  process.stdout.write(`changed=${answer.changed}\n`);

  await writeStepOutputs(nodeFileSystem, process.env['GITHUB_OUTPUT'] ?? '', {
    changed: String(answer.changed),
  });
}
