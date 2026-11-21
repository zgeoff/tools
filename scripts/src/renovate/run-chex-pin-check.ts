import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { chexPinPaths, findUnmanagedChexPin } from './find-unmanaged-chex-pin.ts';

export interface ChexPinCheck {
  readonly cwd: string;

  readonly fileSystem: Pick<FileSystem, 'readText'>;

  readonly writeError: (text: string) => void;
}

export async function runChexPinCheck(check: Readonly<ChexPinCheck>): Promise<number> {
  const renovateText = await check.fileSystem.readText(join(check.cwd, 'renovate.json'));

  const faults = await Promise.all(
    chexPinPaths.map(async (path) => {
      const workflowText = await check.fileSystem.readText(join(check.cwd, path));

      return findUnmanagedChexPin(renovateText, workflowText, path);
    }),
  );

  const found = faults.filter((fault) => fault !== undefined);

  for (const fault of found) {
    check.writeError(`${fault}\n`);
  }

  return found.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exitCode = await runChexPinCheck({
    cwd: process.cwd(),
    fileSystem: nodeFileSystem,
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}
