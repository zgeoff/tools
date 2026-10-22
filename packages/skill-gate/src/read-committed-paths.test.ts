import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { GitError, simpleGit } from 'simple-git';
import { readCommittedPaths } from './read-committed-paths.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-committed-'));

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

test('it reads the changed paths between two commits, a rename as both paths', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');

  await mkdir(join(repo, 'src'), { recursive: true });
  await writeFile(join(repo, 'src/kept.ts'), 'export const kept = 1;\n');
  await writeFile(join(repo, 'src/same.ts'), 'export const same = 1;\n');
  await writeFile(join(repo, 'src/old.test.ts'), "test('it rounds', () => {});\n");

  await $`git init --quiet && git add -A && git commit --quiet -m one`.cwd(repo).env(ctx.gitEnv);

  await writeFile(join(repo, 'src/kept.ts'), 'export const kept = 2;\n');

  await $`git mv src/old.test.ts src/moved.test.ts`.cwd(repo).env(ctx.gitEnv);
  await $`git commit --quiet -am two`.cwd(repo).env(ctx.gitEnv);

  const paths = await readCommittedPaths(
    simpleGit(join(repo, 'src')),
    join(repo, 'src'),
    'HEAD~1',
    'HEAD',
  );

  expect(paths).toIncludeSameMembers([
    join(repo, 'src/kept.ts'),
    join(repo, 'src/moved.test.ts'),
    join(repo, 'src/old.test.ts'),
  ]);
});

test('it reads every path of the first commit from the repo root when there was no commit before', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');

  await mkdir(join(repo, 'src'), { recursive: true });
  await writeFile(join(repo, 'README.md'), '# Fixture\n');
  await writeFile(join(repo, 'src/a.test.ts'), "test('it pads', () => {});\n");

  await $`git init --quiet && git add -A && git commit --quiet -m one`.cwd(repo).env(ctx.gitEnv);

  const paths = await readCommittedPaths(
    simpleGit(join(repo, 'src')),
    join(repo, 'src'),
    null,
    'HEAD',
  );

  expect(paths).toIncludeSameMembers([join(repo, 'README.md'), join(repo, 'src/a.test.ts')]);
});

test('it rejects with a GitError for a commit git does not have', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');

  await mkdir(repo);
  await writeFile(join(repo, 'a.ts'), 'export const a = 1;\n');

  await $`git init --quiet && git add -A && git commit --quiet -m one`.cwd(repo).env(ctx.gitEnv);

  const reading = readCommittedPaths(simpleGit(repo), repo, 'deadbeef', 'HEAD');

  await expect(reading).rejects.toBeInstanceOf(GitError);
});
