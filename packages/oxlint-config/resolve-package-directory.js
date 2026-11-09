import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

// a folder whose `src/` holds the file wins over every `package.json` below it, so one inside
// `src/`, such as one that sets `type`, does not stand in for the package; the walk stops at the
// repo root, so a `package.json` above the checkout never counts
export default function resolvePackageDirectory(filename, root) {
  let nearest = null;
  let source = null;
  let directory = dirname(filename);

  while (true) {
    if (existsSync(join(directory, 'package.json'))) {
      nearest ??= directory;

      if (!relative(join(directory, 'src'), filename).startsWith(`..${sep}`)) {
        source = directory;
      }
    }

    const parent = dirname(directory);

    if (directory === root || parent === directory) {
      return source ?? nearest;
    }

    directory = parent;
  }
}
