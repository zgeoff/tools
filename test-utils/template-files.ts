import { readdir, rename } from 'node:fs/promises';
import { nodeFileSystem } from '../scripts/ci/node-file-system.ts';

export interface TemplateFiles {
  readonly readFile: (path: string) => Promise<Uint8Array>;

  // Lists no names for a folder that does not exist.
  readonly readDirectoryNames: (path: string) => Promise<readonly string[]>;

  readonly createDirectories: (path: string) => Promise<void>;

  readonly writeFile: (path: string, text: string) => Promise<void>;

  readonly removePath: (path: string) => Promise<void>;

  // Moves the folder into place in one rename, and returns false when the target exists.
  readonly moveDirectory: (source: string, target: string) => Promise<boolean>;
}

export const templateFiles: TemplateFiles = {
  readFile: nodeFileSystem.readBytes,
  readDirectoryNames: async (path) => {
    try {
      return await readdir(path);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        return [];
      }

      throw error;
    }
  },
  createDirectories: nodeFileSystem.createDirectory,
  writeFile: nodeFileSystem.writeText,
  removePath: nodeFileSystem.removePath,
  moveDirectory: async (source, target) => {
    try {
      await rename(source, target);

      return true;
    } catch (error) {
      if (hasErrorCode(error, 'ENOTEMPTY') || hasErrorCode(error, 'EEXIST')) {
        return false;
      }

      throw error;
    }
  },
};

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
