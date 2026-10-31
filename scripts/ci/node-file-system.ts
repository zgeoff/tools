import { appendFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { writeTextFile } from '../../packages/chex/src/write-text-file.ts';
import { removePath } from '../../packages/rig/src/browser/remove-path.ts';
import type { FileSystem } from './file-system.ts';

export const nodeFileSystem: FileSystem = {
  readText: (path) => readFile(path, 'utf8'),
  readBytes: async (path) => {
    const buffer = await readFile(path);

    return new Uint8Array(buffer);
  },
  readDirectory: (path) => readdir(path),
  readFilePaths: async (folder) => {
    try {
      await stat(folder);
    } catch {
      return [];
    }

    const paths = await Array.fromAsync(new Bun.Glob('**/*').scan({ cwd: folder }));

    return paths.toSorted();
  },
  writeText: writeTextFile,
  appendText: (path, text) => appendFile(path, text),
  createDirectory: async (path) => {
    await mkdir(path, { recursive: true });
  },
  removePath,
  probePath: async (path) => {
    try {
      await stat(path);

      return true;
    } catch {
      return false;
    }
  },
};
