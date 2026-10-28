import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createStubPullRequestGH(bin: string, state: string): Promise<void> {
  const path = join(bin, 'gh');
  const script = join(import.meta.dir, 'run-stub-pull-request-gh.ts');

  await writeFile(state, '[]\n');

  await writeFile(
    path,
    ['#!/bin/sh', `exec '${process.execPath}' '${script}' '${state}' "$@"`, ''].join('\n'),
  );

  await chmod(path, 0o755);
}
