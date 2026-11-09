import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';

export interface PathMatch {
  readonly path: string;

  readonly pattern: string;
}

export interface PathMatchQuery {
  readonly paths: readonly string[];

  readonly patterns: readonly string[];

  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly runCommand: RunCommand;
}

// The patterns keep their bash meaning, as on.pull_request.paths callers write them, so bash itself
// matches each path: a copy of its glob and extglob rules would drift from it on a malformed
// pattern. The paths reach bash on stdin, so a path's text is never parsed as code.
const matchScript = [
  'shopt -s extglob',
  'while IFS= read -r -d "" path; do',
  '  for pattern in "$@"; do',
  String.raw`    if [[ $path == $pattern ]]; then printf "%s\0%s\0" "$path" "$pattern"; fi`,
  '  done',
  'done',
].join('\n');

// Returns each path and pattern pair that matches, in the order of the paths, then the patterns.
export async function runPathMatch(query: Readonly<PathMatchQuery>): Promise<PathMatch[]> {
  if (query.paths.length === 0 || query.patterns.length === 0) {
    return [];
  }

  const result = await runCheckedCommand(
    query.runCommand,
    ['bash', '-c', matchScript, 'bash', ...query.patterns],
    { cwd: query.cwd, env: query.env, stdin: query.paths.map((path) => `${path}\0`).join('') },
  );

  const fields = result.stdout.split('\0').slice(0, -1);

  return Array.from({ length: fields.length / 2 }, (_, index) => ({
    path: fields[index * 2] ?? '',
    pattern: fields[index * 2 + 1] ?? '',
  }));
}
