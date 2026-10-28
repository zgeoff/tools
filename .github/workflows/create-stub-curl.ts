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
      'if [ "$#" -ne 7 ] || [ "$1" != -fsSL ] || [ "$2" != --retry ] || [ "$3" != 3 ] || [ "$4" != --retry-all-errors ] || [ "$5" != -o ]; then',
      '  echo "stub curl: supports only: curl -fsSL --retry 3 --retry-all-errors -o <path> <url>" >&2',
      '  exit 64',
      'fi',
      `cat '${bodyPath}' > "$6"`,
      `echo "$7" >> '${join(directory, 'curl.urls')}'`,
      '',
    ].join('\n'),
  );

  await chmod(path, 0o755);
}
