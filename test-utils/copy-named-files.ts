import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Copies the named files from one folder into another, which it creates.
export async function copyNamedFiles(
  fromFolder: string,
  toFolder: string,
  names: readonly string[],
): Promise<void> {
  await mkdir(toFolder, { recursive: true });

  await Promise.all(names.map((name) => cp(join(fromFolder, name), join(toFolder, name))));
}
