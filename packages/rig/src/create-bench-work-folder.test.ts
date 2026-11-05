import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { createBenchWorkFolder } from './create-bench-work-folder.ts';
import { readGitCommonDir } from './read-git-common-dir.ts';
import { createTrackedRepo } from './test-utils/create-tracked-repo.ts';

async function setupTest() {
  const prefix = join(tmpdir(), readRunFolderPrefix('create-bench-work-folder-'));

  const directory = await mkdtemp(prefix);

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    repoRoot: join(directory, 'kettle'),
    createBenchWorkFolder: (repoRoot: string) =>
      createBenchWorkFolder(repoRoot, {
        readGitCommonDir,
        createFolder: async (path) => {
          await mkdir(path, { recursive: true });
        },
        createTempFolder: (folderPrefix) => mkdtemp(folderPrefix),
      }),
  };
}

test('it makes a new folder under rig-bench in the git folder of the repo', async () => {
  const ctx = await setupTest();

  await createTrackedRepo(ctx.repoRoot, { 'package.json': '{"name":"kettle"}' });

  const workFolder = await ctx.createBenchWorkFolder(ctx.repoRoot);
  const workFolderStat = await stat(workFolder);

  expect({ parent: dirname(workFolder), isDirectory: workFolderStat.isDirectory() }).toStrictEqual({
    parent: join(ctx.repoRoot, '.git', 'rig-bench'),
    isDirectory: true,
  });
});

test('it makes a different folder for each run', async () => {
  const ctx = await setupTest();

  await createTrackedRepo(ctx.repoRoot, { 'package.json': '{"name":"kettle"}' });

  const firstFolder = await ctx.createBenchWorkFolder(ctx.repoRoot);
  const secondFolder = await ctx.createBenchWorkFolder(ctx.repoRoot);

  expect(secondFolder).not.toBe(firstFolder);
});
