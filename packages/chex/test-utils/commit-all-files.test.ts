import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { commitAllFiles } from './commit-all-files.ts';
import { readGitEnv } from './read-git-env.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const repo = await mkdtemp(join(tmpdir(), 'commit-all-files-'));

  onTestFinished(() => rm(repo, { recursive: true, force: true }));

  const env = readGitEnv(repo);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

  return { repo, env };
}

test('it commits every file in the work tree with the message', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, { 'notes.txt': 'The kettle boils.\n', 'lid/size.txt': 'small\n' });
  await commitAllFiles(ctx.repo, ctx.env, 'docs: add the notes');

  const log = await $`git log --format=%s --name-only`
    .cwd(ctx.repo)
    .env({ ...ctx.env })
    .text();

  expect(log).toBe('docs: add the notes\n\nlid/size.txt\nnotes.txt\n');
});
