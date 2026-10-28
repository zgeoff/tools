import { $ } from 'bun';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';

export interface ChangedFilesMatch {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly event: string;

  // One pattern per line, as in on.pull_request.paths.
  readonly patterns: string;
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

  const patterns = match.patterns.split('\n').filter((pattern) => pattern !== '');

  const matches = files.flatMap((file) =>
    patterns
      .filter((pattern) => isPathMatched(file, pattern))
      .map((pattern) => `${file} matches ${pattern}`),
  );

  return { changed: matches.length > 0, matches };
}

// The merge commit against the base it merges into: what the merge changes. --no-renames lists a
// moved file's old path too, and -z leaves a path unquoted whatever its characters.
async function readMergeChangedFiles(match: Readonly<ChangedFilesMatch>): Promise<string[]> {
  const listed = await $`git diff -z --name-only --no-renames HEAD^1 HEAD`
    .cwd(match.cwd)
    .env({ ...match.env })
    .quiet()
    .text();

  return listed.split('\0').filter((file) => file !== '');
}

// Matches as a bash [[ path == pattern ]] does: `*` matches any text, `/` included, `?` one
// character, `[...]` one character of a set, and a backslash makes the next character literal.
export function isPathMatched(path: string, pattern: string): boolean {
  return new RegExp(`^${buildPatternSource(pattern)}$`, 'su').test(path);
}

// A bracket set ends at the first `]` after its first member, so `[]a]` holds `]` and `a`. A `[`
// with no `]` after it is a literal.
const patternTokens = /\\[\s\S]|\[[!^]?\]?[^\]]*\]|[\s\S]/gu;

function buildPatternSource(pattern: string): string {
  return (pattern.match(patternTokens) ?? []).map((token) => buildTokenSource(token)).join('');
}

function buildTokenSource(token: string): string {
  if (token === '*') {
    return '.*';
  }

  if (token === '?') {
    return '.';
  }

  if (token.length > 1 && token.startsWith('\\')) {
    return RegExp.escape(token.slice(1));
  }

  if (token.length > 1 && token.startsWith('[')) {
    return buildBracketSource(token.slice(1, -1));
  }

  return RegExp.escape(token);
}

function buildBracketSource(members: string): string {
  const negated = members.startsWith('!') || members.startsWith('^');
  const set = negated ? members.slice(1) : members;
  const escaped = set.replaceAll(/[\\\]^]/gu, (character) => `\\${character}`);

  return `[${negated ? '^' : ''}${escaped}]`;
}

if (import.meta.main) {
  const answer = await matchChangedFiles({
    cwd: process.cwd(),
    env: process.env,
    event: process.env['EVENT'] ?? '',
    patterns: process.env['PATTERNS'] ?? '',
  });

  for (const line of answer.matches) {
    process.stdout.write(`${line}\n`);
  }

  process.stdout.write(`changed=${answer.changed}\n`);

  await writeStepOutputs(process.env['GITHUB_OUTPUT'] ?? '', { changed: String(answer.changed) });
}
