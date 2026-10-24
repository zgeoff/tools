import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export default function resolveSuiteDirectory(root, filename) {
  const directories = relative(root, filename).split(sep).slice(0, -1);

  if (directories[0] === '..') {
    return null;
  }

  for (const [index, name] of directories.entries()) {
    const parent = join(root, ...directories.slice(0, index));

    if (
      (name === 'e2e' || name === 'integration' || name === 'evals') &&
      probeAppRoot(root, parent)
    ) {
      return name;
    }

    if (name.endsWith('-e2e') && existsSync(join(parent, name, 'package.json'))) {
      return 'e2e';
    }
  }

  return null;
}

function probeAppRoot(root, directory) {
  return directory === root || existsSync(join(directory, 'package.json'));
}
