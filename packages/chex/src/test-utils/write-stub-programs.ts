import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes each program as an executable sh script with the given body, in a folder it creates.
export async function writeStubPrograms(
  folder: string,
  bodies: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(folder, { recursive: true });

  await Promise.all(
    Object.entries(bodies).map(async ([name, body]: readonly [string, string]) => {
      await writeFile(join(folder, name), `#!/bin/sh\n${body}\n`);
      await chmod(join(folder, name), 0o755);
    }),
  );
}
