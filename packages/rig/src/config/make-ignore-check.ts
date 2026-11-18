// bun test reads each ignore pattern as a glob on the path relative to the repo root, and skips a
// folder that a glob matches during discovery, so a file under a matched folder is ignored too.
export function makeIgnoreCheck(patterns: readonly string[]): (path: string) => boolean {
  const globs = patterns.map((pattern) => new Bun.Glob(pattern));

  return (path) => {
    const segments = path.split('/');

    return segments.some((_, index) => {
      const prefix = segments.slice(0, index + 1).join('/');

      return globs.some((glob) => glob.match(prefix));
    });
  };
}
