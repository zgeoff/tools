import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

// walks up from the linted file the way node resolves a package, so a nested workspace finds the
// kit its own node_modules holds before the root's; `null` when no folder above installs it
export default function readTestingKitDirectory(filename) {
  let directory = dirname(filename);

  while (true) {
    const candidate = join(directory, 'node_modules', '@zgeoff', 'testing');

    if (existsSync(join(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }

    const parent = dirname(directory);

    if (parent === directory) {
      return null;
    }

    directory = parent;
  }
}
