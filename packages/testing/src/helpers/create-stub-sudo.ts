import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes a stand-in for sudo into the folder. It answers the probe `sudo -n true` with success. Any
// other call appends a line per argument to the record, `file <argument>` when the argument names a
// file that exists and `text <argument>` otherwise, then fails as a command that never starts does.
export async function createStubSudo(directory: string, record: string): Promise<void> {
  const path = join(directory, 'sudo');

  await writeFile(
    path,
    [
      '#!/bin/bash',
      `[ "$*" = '-n true' ] && exit 0`,
      'for argument in "$@"; do',
      '  if [ -f "$argument" ]; then kind=file; else kind=text; fi',
      `  printf '%s %s\\n' "$kind" "$argument" >> '${record}'`,
      'done',
      'exit 1',
      '',
    ].join('\n'),
  );

  await chmod(path, 0o755);
}
