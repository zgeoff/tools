import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// The filesystem effects a step script reaches, which its CLI passes in as the real ones.
export interface FileSystem {
  readonly readText: (path: string) => Promise<string>;
  readonly readBytes: (path: string) => Promise<Uint8Array>;
  readonly readDirectory: (path: string) => Promise<string[]>;

  // Writes the text in place of the file's contents, and creates its folders first.
  readonly writeText: (path: string, text: string) => Promise<void>;
  readonly appendText: (path: string, text: string) => Promise<void>;
  readonly createDirectory: (path: string) => Promise<void>;

  // Removes a file or a folder with all it holds; a missing path is no error.
  readonly removePath: (path: string) => Promise<void>;
  readonly probePath: (path: string) => Promise<boolean>;
}

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
  removePath: (path) => rm(path, { recursive: true, force: true }),
  probePath: async (path) => {
    try {
      await stat(path);

      return true;
    } catch {
      return false;
    }
  },
};
