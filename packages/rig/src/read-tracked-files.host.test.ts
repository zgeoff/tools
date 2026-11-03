import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitCommit } from '@zgeoff/std/test-utils/create-git-commit';
import { readGitEnv } from '@zgeoff/std/test-utils/read-git-env';
import { runGit } from '@zgeoff/std/test-utils/run-git';
import { writeTreeFiles } from '@zgeoff/std/test-utils/write-tree-files';
import { readTrackedFiles } from './read-tracked-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `rig-tracked-files-pid${process.pid}-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const repo = join(directory, 'repo');

  await mkdir(repo);
  await runGit(repo, env, ['init', '--quiet']);

  return { repo, env };
}

test('it lists the files that git tracks and leaves out the untracked ones', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.repo, ctx.env, {
    'README.md': 'notes\n',
    'src/a.test.ts': '',
    'e2e/login.test.ts': '',
  });

  await writeTreeFiles(ctx.repo, { 'scratch/notes.txt': 'draft\n' });

  const files = await readTrackedFiles(ctx.repo);

  expect(files).toIncludeSameMembers(['README.md', 'src/a.test.ts', 'e2e/login.test.ts']);
});
