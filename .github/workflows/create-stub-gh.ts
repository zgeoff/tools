import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes a gh executable into `bin` that runs run-stub-gh.ts, a stand-in for the pull-request
// commands of one repository that keeps its pull requests in `state`, a JSON array. The state
// starts empty.
export async function createStubGh(bin: string, state: string): Promise<void> {
  const path = join(bin, 'gh');
  const script = join(import.meta.dir, 'run-stub-gh.ts');

  await writeFile(state, '[]\n');

  await writeFile(
    path,
    ['#!/bin/sh', `exec '${process.execPath}' '${script}' '${state}' "$@"`, ''].join('\n'),
  );

  await chmod(path, 0o755);
}
