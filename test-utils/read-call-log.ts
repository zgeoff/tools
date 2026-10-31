import { readTextOrEmpty } from './read-text-or-empty.ts';

// Reads the calls a stand-in appended to its log, one per line, and none when it never ran.
export async function readCallLog(path: string): Promise<string[]> {
  const text = await readTextOrEmpty(path);

  return text.split('\n').filter((line) => line !== '');
}
