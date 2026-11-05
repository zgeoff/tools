import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { processRuntime } from './browser/process-runtime.ts';
import { readCommandOutput } from './read-command-output.ts';
import { readGitPrefix } from './read-git-prefix.ts';
import { createTrackedRepo } from './test-utils/create-tracked-repo.ts';

async function setupTest() {
  const prefix = join(tmpdir(), readRunFolderPrefix('read-git-prefix-'));

  const directory = await mkdtemp(prefix);

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    repoRoot: join(directory, 'kettle'),

    // The temp folder can sit inside a git repo, so git stops its upward search above it.
    readGitPrefix: (folder: string) =>
      readGitPrefix(
        folder,
        { ...process.env, GIT_CEILING_DIRECTORIES: dirname(directory) },
        {
          readCommandOutput: (command, options) =>
            readCommandOutput(command, options, processRuntime),
        },
      ),
  };
}

test('it reads an empty prefix at the top level of the repo', async () => {
  const ctx = await setupTest();

  await createTrackedRepo(ctx.repoRoot, { 'package.json': '{"name":"kettle"}' });

  expect(ctx.readGitPrefix(ctx.repoRoot)).resolves.toBe('');
});

test('it reads the path of a package folder inside the repo', async () => {
  const ctx = await setupTest();

  await createTrackedRepo(ctx.repoRoot, {
    'package.json': '{"name":"kettle"}',
    'packages/spout/package.json': '{"name":"spout"}',
  });

  expect(ctx.readGitPrefix(join(ctx.repoRoot, 'packages', 'spout'))).resolves.toBe(
    'packages/spout/',
  );
});

test('it throws with the command and the exit code when the folder is in no git repo', async () => {
  const ctx = await setupTest();

  await createTrackedRepo(ctx.repoRoot, { 'package.json': '{"name":"kettle"}' });

  const outside = dirname(ctx.repoRoot);

  expect(ctx.readGitPrefix(outside)).rejects.toThrow(
    `git rev-parse --show-prefix failed in ${outside} with exit code 128`,
  );
});
