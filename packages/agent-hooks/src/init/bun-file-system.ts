import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { InitFileSystem } from './types.ts';

export const bunFileSystem: InitFileSystem = {
  readText: async (filePath) => {
    const file = Bun.file(filePath);

    const exists = await file.exists();

    return exists ? file.text() : null;
  },
  writeText: async (filePath, text) => {
    await mkdir(path.dirname(filePath), { recursive: true });

    await Bun.write(filePath, text);
  },
};
