import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createStubCurl(bin: string, body: string | Uint8Array): Promise<void> {
  const path = join(bin, 'curl');
  const bodyPath = join(bin, 'curl.body');

  await writeFile(bodyPath, body);

  await writeFile(
    path,
    [
      '#!/bin/sh',
      'if [ "$#" -ne 4 ] || [ "$1" != -fsSL ] || [ "$2" != -o ]; then',
      '  echo "stub curl: supports only: curl -fsSL -o <path> <url>" >&2',
      '  exit 64',
      'fi',
      `cat '${bodyPath}' > "$3"`,
      `echo "$4" >> '${join(bin, 'curl.urls')}'`,
      '',
    ].join('\n'),
  );

  await chmod(path, 0o755);
}
