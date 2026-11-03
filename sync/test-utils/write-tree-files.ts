import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeTreeFiles(
  directory: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([path, content]: readonly [string, string]) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), content);
    }),
  );
}
