import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { processRuntime } from './browser/process-runtime.ts';
import { readCommandOutput } from './read-command-output.ts';
import { readGitCommonDir } from './read-git-common-dir.ts';
import { createTrackedRepo } from './test-utils/create-tracked-repo.ts';

async function setupTest() {
  const prefix = join(tmpdir(), readRunFolderPrefix('read-git-common-dir-'));

  const directory = await mkdtemp(prefix);

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { repoRoot: join(directory, 'kettle') };
}

test('it reads the git folder of a main checkout as git prints it', async () => {
  const ctx = await setupTest();

  await createTrackedRepo(ctx.repoRoot, { 'package.json': '{"name":"kettle"}' });

  expect(
    readGitCommonDir(ctx.repoRoot, process.env, {
      readCommandOutput: (command, options) => readCommandOutput(command, options, processRuntime),
    }),
  ).resolves.toBe('.git');
});

test('it throws with the command and the exit code when the folder is in no git repo', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.repoRoot);

  // The temp folder can sit inside a git repo, so git stops its upward search above the folder.
  const environment = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(ctx.repoRoot) };

  expect(
    readGitCommonDir(ctx.repoRoot, environment, {
      readCommandOutput: (command, options) => readCommandOutput(command, options, processRuntime),
    }),
  ).rejects.toThrow(`git rev-parse --git-common-dir failed in ${ctx.repoRoot} with exit code 128`);
});
