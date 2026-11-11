import { posix } from 'node:path';

// A bench file sits in the `bench/` folder of a package, or beside the module it measures under the
// package's `src/`. The root of a single-package repo counts as a package.
export function collectBenchFiles(
  trackedFiles: readonly string[],
  isWorkspaceRepo: boolean,
): readonly string[] {
  const tracked = new Set(trackedFiles);

  return trackedFiles.filter(
    (file) =>
      file.endsWith('.bench.ts') &&
      listPackageFolders(file).some((folder) =>
        folder === '' ? !isWorkspaceRepo : tracked.has(posix.join(folder, 'package.json')),
      ),
  );
}

// The folders that hold the file as a bench file if they are a package: the parent of the `bench/`
// folder the file sits in, and the parent of each `src/` folder above the file.
function listPackageFolders(file: string): readonly string[] {
  const segments = file.split('/');
  const parents = segments.slice(0, -1);

  return parents.flatMap((segment, index) => {
    const isBenchFolder = segment === 'bench' && index === parents.length - 1;

    return isBenchFolder || segment === 'src' ? [parents.slice(0, index).join('/')] : [];
  });
}
