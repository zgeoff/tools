import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

export default function resolveSourcePackage(filename) {
  let directory = dirname(filename);

  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory);

    if (parent === directory) {
      return null;
    }

    directory = parent;
  }

  const path = relative(join(directory, 'src'), filename).split(sep).join('/');

  if (path.startsWith('../')) {
    return null;
  }

  return { directory, manifest: readManifest(directory), path };
}

function readManifest(directory) {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
}
