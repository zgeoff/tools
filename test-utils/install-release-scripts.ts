import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const releaseScripts = ['check-release-head.sh', 'merge-release-prs.sh'] as const;

// Copies the repo's release scripts into the directory, where the release
// job's fetch step leaves them.
export async function installReleaseScripts(directory: string): Promise<void> {
  await Promise.all(
    releaseScripts.map((script) =>
      copyFile(join(import.meta.dir, '..', 'scripts', script), join(directory, script)),
    ),
  );
}
