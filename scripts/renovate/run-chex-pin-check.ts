import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { chexPinPath, findUnmanagedChexPin } from './find-unmanaged-chex-pin.ts';

export interface ChexPinCheck {
  readonly cwd: string;

  readonly fileSystem: Pick<FileSystem, 'readText'>;

  readonly writeError: (text: string) => void;
}

export async function runChexPinCheck(check: Readonly<ChexPinCheck>): Promise<number> {
  const renovateText = await check.fileSystem.readText(join(check.cwd, 'renovate.json'));
  const workflowText = await check.fileSystem.readText(join(check.cwd, chexPinPath));

  const fault = findUnmanagedChexPin(renovateText, workflowText);

  if (fault !== undefined) {
    check.writeError(`${fault}\n`);

    return 1;
  }

  return 0;
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
