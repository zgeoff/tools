import { posix } from 'node:path';

// Resolves the patterns of the root package.json `workspaces` field against the folders that hold
// a tracked package.json. A pattern that starts with `!` leaves its folders out.
export function collectWorkspaceRoots(
  trackedPaths: readonly string[],
  patterns: readonly string[],
): string[] {
  const included = patterns.filter((pattern) => !pattern.startsWith('!'));

  const excluded = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));

  return trackedPaths
    .filter((path) => posix.basename(path) === 'package.json' && path !== 'package.json')
    .map((path) => posix.dirname(path))
    .filter(
      (folder) =>
        included.some((pattern) => new Bun.Glob(pattern).match(folder)) &&
        !excluded.some((pattern) => new Bun.Glob(pattern).match(folder)),
    )
    .toSorted();
}
