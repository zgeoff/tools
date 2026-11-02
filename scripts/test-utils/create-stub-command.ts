import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes a stand-in for a command that prints the given output, succeeds, and appends its name and
// arguments to the log, one call per line.
export async function createStubCommand(
  directory: string,
  name: string,
  log: string,
  output = '',
): Promise<void> {
  const path = join(directory, name);
  const outputPath = join(directory, `${name}.output`);

  await writeFile(outputPath, output);

  await writeFile(
    path,
    ['#!/bin/sh', `echo "${name} $*" >> '${log}'`, `cat '${outputPath}'`, ''].join('\n'),
  );

  await chmod(path, 0o755);
}
