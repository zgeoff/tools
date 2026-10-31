import { join } from 'node:path';
import { parsePackageBin } from './parse-package-bin.ts';

export interface PackedBinFiles {
  readonly readJSON: (path: string) => Promise<unknown>;

  readonly probeFile: (path: string) => Promise<boolean>;
}

// Returns the absolute path of the bin that the extracted package declares, and throws when the
// manifest declares none or the tarball lacks its file.
export async function readPackedBin(
  packageDir: string,
  commandName: string,
  files: PackedBinFiles,
): Promise<string> {
  const manifestPath = join(packageDir, 'package.json');

  const manifest = await files.readJSON(manifestPath);

  const binPath = parsePackageBin(manifest, commandName);

  if (binPath === null) {
    throw new Error(`the packed ${manifestPath} declares no bin named ${commandName}`);
  }

  const absolutePath = join(packageDir, binPath);

  if (!(await files.probeFile(absolutePath))) {
    throw new Error(
      `the packed ${commandName} declares the bin ${binPath}, which its tarball lacks`,
    );
  }

  return absolutePath;
}
