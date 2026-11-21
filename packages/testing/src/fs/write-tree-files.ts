import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { removeFolder } from './remove-folder.ts';
import type { TreeFiles } from './types.ts';

// Writes each file, with the folders it needs. A null entry deletes the file, and a file that is
// not there is no error. A symlink entry replaces a file or link at its path.
export async function writeTreeFiles(directory: string, files: TreeFiles): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const target = join(directory, path);

      if (content === null) {
        removeFolder(target);

        return;
      }

      await mkdir(dirname(target), { recursive: true });

      if (typeof content === 'string') {
        await writeFile(target, content);

        return;
      }

      removeFolder(target);

      await symlink(content.symlink, target);
    }),
  );
}
