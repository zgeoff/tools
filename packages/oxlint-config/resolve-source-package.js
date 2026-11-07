import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import readPackageManifest from './read-package-manifest.js';

// the package is the nearest folder above the file whose `src/` holds it, so a `package.json` inside
// `src/`, such as one that sets `type`, does not stand in for the package
export default function resolveSourcePackage(filename) {
  let directory = dirname(filename);

  while (true) {
    const path = relative(join(directory, 'src'), filename).split(sep).join('/');

    if (!path.startsWith('../') && existsSync(join(directory, 'package.json'))) {
      return { directory, manifest: readPackageManifest(directory), path };
    }

    const parent = dirname(directory);

    if (parent === directory) {
      return null;
    }

    directory = parent;
  }
}
