// An `e2e` folder counts in a folder that holds a package.json, and at the repo root only in a
// single-package repo: a workspace repo keeps each e2e folder in the package it tests.
export function pickE2EDirs(
  trackedFiles: readonly string[],
  isWorkspaceRepo: boolean,
): readonly string[] {
  const tracked = new Set(trackedFiles);
  const dirs = new Set<string>();

  for (const file of trackedFiles) {
    const segments = file.split('/').slice(0, -1);

    for (const [index, name] of segments.entries()) {
      const parent = segments.slice(0, index).join('/');
      const prefix = parent === '' ? '' : `${parent}/`;
      const isRoot = parent === '';

      const isE2EDir =
        name === 'e2e' && (isRoot ? !isWorkspaceRepo : tracked.has(`${prefix}package.json`));

      if (isE2EDir) {
        dirs.add(`${prefix}${name}`);
      }
    }
  }

  return [...dirs].toSorted();
}
