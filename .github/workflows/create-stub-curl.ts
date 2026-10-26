import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createStubCurl(directory: string, body: string | Uint8Array): Promise<void> {
  const path = join(directory, 'curl');
  const bodyPath = join(directory, 'curl.body');

  await writeFile(bodyPath, body);

  // The URL log starts empty, so a test reads it the same way whether or not
  // a download happened.
  await writeFile(join(directory, 'curl.urls'), '');

  await writeFile(
    path,
    [
      '#!/bin/sh',
      'if [ "$#" -ne 4 ] || [ "$1" != -fsSL ] || [ "$2" != -o ]; then',
      '  echo "stub curl: supports only: curl -fsSL -o <path> <url>" >&2',
      '  exit 64',
      'fi',
      `cat '${bodyPath}' > "$3"`,
      `echo "$4" >> '${join(directory, 'curl.urls')}'`,
      '',
    ].join('\n'),
  );

  await chmod(path, 0o755);
}
