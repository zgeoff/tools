import { readFile } from 'node:fs/promises';

export async function readOptionalText(path: string): Promise<string | undefined> {
  const exists = await Bun.file(path).exists();

  return exists ? readFile(path, 'utf8') : undefined;
}
