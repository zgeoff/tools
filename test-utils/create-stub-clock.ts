import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes a stand-in for `date +%s` that prints the given times in order, one
// per call, and repeats the last one.
export async function createStubClock(directory: string, times: readonly number[]): Promise<void> {
  const path = join(directory, 'date');
  const timesPath = join(directory, 'date.times');
  const countPath = join(directory, 'date.count');

  await writeFile(timesPath, times.map((time) => `${time}\n`).join(''));
  await writeFile(countPath, '0\n');

  await writeFile(
    path,
    [
      '#!/bin/sh',
      'if [ "$#" -ne 1 ] || [ "$1" != +%s ]; then',
      '  echo "stub date: supports only: date +%s" >&2',
      '  exit 64',
      'fi',
      `count=$(cat '${countPath}')`,
      `total=$(wc -l < '${timesPath}')`,
      `sed -n "$(( count < total ? count + 1 : total ))p" '${timesPath}'`,
      `echo $((count + 1)) > '${countPath}'`,
      '',
    ].join('\n'),
  );

  await chmod(path, 0o755);
}
