import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createStubBun(bin: string, log: string): Promise<void> {
  const path = join(bin, 'bun');

  await writeFile(
    path,
    [
      '#!/bin/sh',
      'if [ "$#" -ne 2 ] || [ "$1" != run ]; then',
      '  echo "stub bun: supports only: bun run <script>" >&2',
      '  exit 64',
      'fi',
      `echo "$2" >> '${log}'`,
      '',
    ].join('\n'),
  );

  await chmod(path, 0o755);
}
