import { posix } from 'node:path';

const benchFilePattern = /^(?:(?<folder>.*)\/)?bench\/[^/]+\.bench\.ts$/u;

// A bench file sits in the `bench/` folder of a package, or of the root of a single-package repo.
export function collectBenchFiles(
  trackedFiles: readonly string[],
  isWorkspaceRepo: boolean,
): readonly string[] {
  const tracked = new Set(trackedFiles);

  return trackedFiles.filter((file) => {
    const match = benchFilePattern.exec(file);

    if (match === null) {
      return false;
    }

    const folder = match.groups?.['folder'] ?? '';

    return folder === '' ? !isWorkspaceRepo : tracked.has(posix.join(folder, 'package.json'));
  });
}
