import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes a bun executable into `bin` that stands in for `bun run <script>`: it appends the script
// name to `log`, one per line, and runs nothing. Any other command line exits 64, so a step that
// calls bun some other way fails instead of passing unseen.
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
