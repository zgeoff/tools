// bun test reads each ignore pattern as a glob on the path relative to the repo root, and Bun.Glob
// matches the same way, so rig and bun test leave out the same files.
export function makeIgnoreCheck(patterns: readonly string[]): (path: string) => boolean {
  const globs = patterns.map((pattern) => new Bun.Glob(pattern));

  return (path) => globs.some((glob) => glob.match(path));
}
