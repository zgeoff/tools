import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

// a folder whose `src/` holds the file wins over a nearer `package.json`, so one inside `src/`,
// such as one that sets `type`, does not stand in for the package
export default function resolvePackageDirectory(filename) {
  let nearest = null;
  let directory = dirname(filename);

  while (true) {
    if (existsSync(join(directory, 'package.json'))) {
      if (!relative(join(directory, 'src'), filename).startsWith(`..${sep}`)) {
        return directory;
      }

      nearest ??= directory;
    }

    const parent = dirname(directory);

    if (parent === directory) {
      return nearest;
    }

    directory = parent;
  }
}
