import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { simpleGit } from 'simple-git';
import { readCommitHashes } from './read-commit-hashes.ts';
import { readFileHashes } from './read-file-hashes.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-commit-hashes-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // git reads no user config without HOME, so the commits stay unsigned and need no identity.
  const gitEnv = {
    PATH: process.env['PATH'],
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  };

  return { directory, gitEnv };
}

test('it hashes a committed path as its unchanged file and gives a path the commit lacks null', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');

  await mkdir(join(repo, 'pkg/src'), { recursive: true });
  await writeFile(join(repo, 'pkg/src/a.test.ts'), "test('it pads', () => {});\n");

  await $`git init --quiet && git add -A && git commit --quiet -m one`.cwd(repo).env(ctx.gitEnv);

  const project = join(repo, 'pkg');

  const fileHashes = await readFileHashes(project, ['src/a.test.ts']);

  const commitHashes = await readCommitHashes(simpleGit(project), 'HEAD', [
    'src/a.test.ts',
    'src/new.test.ts',
  ]);

  expect(fileHashes).toStrictEqual({ 'src/a.test.ts': expect.any(String) });
  expect(commitHashes).toStrictEqual({ ...fileHashes, 'src/new.test.ts': null });
});

test('it gives every path null when there is no commit', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');

  await mkdir(repo);

  await $`git init --quiet`.cwd(repo).env(ctx.gitEnv);

  const commitHashes = await readCommitHashes(simpleGit(repo), null, ['a.test.ts']);

  expect(commitHashes).toStrictEqual({ 'a.test.ts': null });
});
