import { lstat, mkdir } from 'node:fs/promises';
import { hasErrorCode } from './has-error-code.ts';
import { readDirNames } from './read-dir-names.ts';
import { removePath } from './remove-path.ts';

export interface PathStatus {
  readonly isDirectory: boolean;

  readonly ownerID: number;

  readonly mode: number;
}

export interface LaneFiles {
  readonly createPrivateDir: (path: string) => Promise<void>;

  readonly createDirs: (path: string) => Promise<void>;

  readonly readStatus: (path: string) => Promise<PathStatus | null>;

  readonly readDirNames: (path: string) => Promise<readonly string[]>;

  readonly removePath: (path: string) => Promise<void>;
}

export const laneFiles: LaneFiles = {
  createPrivateDir: async (path) => {
    await mkdir(path, { mode: 0o700 }).catch((error: unknown) => {
      if (!hasErrorCode(error, 'EEXIST')) {
        throw error;
      }
    });
  },
  createDirs: async (path) => {
    await mkdir(path, { recursive: true, mode: 0o700 });
  },
  readStatus: async (path) => {
    const stats = await lstat(path).catch((error: unknown) => {
      if (hasErrorCode(error, 'ENOENT')) {
        return null;
      }

      throw error;
    });

    return stats === null
      ? null
      : {
          isDirectory: stats.isDirectory(),
          ownerID: stats.uid,
          mode: stats.mode,
        };
  },
  readDirNames,
  removePath,
};
