import { readFile } from 'node:fs/promises';

// A file that a stand-in writes only when it runs reads as empty until then, and every other read
// error still fails the test.
export async function readTextOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}
