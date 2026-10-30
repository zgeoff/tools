// An `e2e` folder counts at the repo root or in an app root, which holds a package.json, and a
// folder whose name ends in `-e2e` counts as a package of its own.
export function pickE2EDirs(trackedFiles: readonly string[]): readonly string[] {
  const tracked = new Set(trackedFiles);
  const dirs = new Set<string>();

  for (const file of trackedFiles) {
    const segments = file.split('/').slice(0, -1);

    for (const [index, name] of segments.entries()) {
      const parent = segments.slice(0, index).join('/');
      const prefix = parent === '' ? '' : `${parent}/`;

      const isE2EDir =
        (name === 'e2e' && (parent === '' || tracked.has(`${prefix}package.json`))) ||
        (name.endsWith('-e2e') && tracked.has(`${prefix}${name}/package.json`));

      if (isE2EDir) {
        dirs.add(`${prefix}${name}`);
      }
    }
  }

  return [...dirs].toSorted();
}
