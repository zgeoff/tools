import { readdir } from 'node:fs/promises';
import { hasErrorCode } from './has-error-code.ts';

// Lists no names for a folder that does not exist.
export async function readDirNames(path: string): Promise<readonly string[]> {
  try {
    return await readdir(path);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return [];
    }

    throw error;
  }
}
