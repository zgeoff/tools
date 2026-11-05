import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix, writeTreeFiles } from '@zgeoff/testing/helpers';
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

  expect(readGitCommonDir(ctx.repoRoot)).resolves.toBe('.git');
});

test('it throws when git finds no repository', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, { '.git': 'gitdir: ./no-such-folder\n' });

  expect(readGitCommonDir(ctx.repoRoot)).rejects.toThrow(
    `git rev-parse --git-common-dir failed in ${ctx.repoRoot} with exit code 128`,
  );
});
