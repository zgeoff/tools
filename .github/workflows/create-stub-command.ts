import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes a stand-in for a command that prints nothing, succeeds, and appends
// its name and arguments to the log, one call per line.
export async function createStubCommand(bin: string, name: string, log: string): Promise<void> {
  const path = join(bin, name);

  await writeFile(path, ['#!/bin/sh', `echo "${name} $*" >> '${log}'`, ''].join('\n'));
  await chmod(path, 0o755);
}
