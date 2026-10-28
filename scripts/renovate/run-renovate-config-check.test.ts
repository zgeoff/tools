import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { CommandOptions } from '../ci/run-command.ts';
import { runRenovateConfigCheck } from './run-renovate-config-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-renovate-config-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it validates default.json strictly at the pinned version and returns the validator exit code', async () => {
  const ctx = await setupTest();

  const calls: { argv: readonly string[]; cwd: string }[] = [];

  await writeTreeFiles(ctx.directory, {
    '.github/workflows/renovate.yml':
      'jobs:\n  renovate:\n    steps:\n      - with:\n          renovate-version: 44.1.0\n',
  });

  const exitCode = await runRenovateConfigCheck({
    cwd: ctx.directory,
    env: {},
    fileSystem: nodeFileSystem,
    runLoggedCommand: (argv: readonly string[], options: Readonly<CommandOptions>) => {
      calls.push({ argv, cwd: options.cwd });

      return Promise.resolve({
        exitCode: 1,
        stdout: 'ERROR: Config validation failed\n',
        stderr: '',
      });
    },
  });

  expect(exitCode).toBe(1);

  expect(calls).toStrictEqual([
    {
      argv: [
        'npx',
        '--yes',
        '--package',
        'renovate@44.1.0',
        '--',
        'renovate-config-validator',
        '--strict',
        '--no-global',
        'default.json',
      ],
      cwd: ctx.directory,
    },
  ]);
});
