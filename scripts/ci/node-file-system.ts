import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { removePath } from '../../packages/rig/src/browser/remove-path.ts';
import type { FileSystem } from './file-system.ts';

export const nodeFileSystem: FileSystem = {
  readText: (path) => readFile(path, 'utf8'),
  readBytes: async (path) => {
    const buffer = await readFile(path);

    return new Uint8Array(buffer);
  },
  readDirectory: (path) => readdir(path),
  writeText: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  },
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
