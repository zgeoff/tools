import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { readRunFolderPrefix } from '../test-utils/read-run-folder-prefix.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';
import { runChexPinCheck } from './run-chex-pin-check.ts';

async function setupTest() {
  const directory = await mkdtemp(
    join(import.meta.dir, readRunFolderPrefix('.test-run-chex-pin-check-')),
  );

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const errors: string[] = [];

  const runCheck = () =>
    runChexPinCheck({
      cwd: directory,
      fileSystem: nodeFileSystem,
      writeError: (text) => {
        errors.push(text);
      },
    });

  return { directory, errors, runCheck };
}

test('it exits 0 when renovate.json captures the chex pin of the workflow', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'renovate.json': JSON.stringify({
      customManagers: [
        {
          customType: 'regex',
          managerFilePatterns: [String.raw`/^\.github/workflows/bun-checks\.yml$/`],
          matchStrings: ["CHEX: '(?<depName>@zgeoff/chex)@(?<currentValue>[^']+)'"],
        },
      ],
    }),
    '.github/workflows/bun-checks.yml': "env:\n  CHEX: '@zgeoff/chex@0.3.1'\n",
  });

  const exitCode = await ctx.runCheck();

  expect({ exitCode, errors: ctx.errors }).toStrictEqual({ exitCode: 0, errors: [] });
});

test('it exits 1 on stderr when renovate.json has no manager for the chex pin', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'renovate.json': JSON.stringify({ extends: ['github>zgeoff/tools'] }),
    '.github/workflows/bun-checks.yml': "env:\n  CHEX: '@zgeoff/chex@0.3.1'\n",
  });

  const exitCode = await ctx.runCheck();

  expect({ exitCode, errors: ctx.errors }).toStrictEqual({
    exitCode: 1,
    errors: [
      'renovate.json: no custom manager captures the @zgeoff/chex pin in .github/workflows/bun-checks.yml, so Renovate never bumps it\n',
    ],
  });
});
