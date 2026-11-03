import { dirname, join } from 'node:path';

// The repo root is the nearest folder above `cwd`, or `cwd` itself, that holds rig.config.ts.
export function resolveRepoRoot(cwd: string, probeFile: (path: string) => boolean): string {
  let directory = cwd;

  while (!probeFile(join(directory, 'rig.config.ts'))) {
    const parent = dirname(directory);

    if (parent === directory) {
      throw new Error(`no rig.config.ts sits in ${cwd} or any folder above it`);
    }

    directory = parent;
  }

  return directory;
}
