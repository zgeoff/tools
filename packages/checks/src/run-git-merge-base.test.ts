import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { runGitMergeBase } from './run-git-merge-base.ts';

// A git repo in a temp folder, with a clean environment so a hook's GIT_DIR cannot reach it.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-git-merge-base-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.com',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.com',
  };

  await $`git init --quiet`.cwd(directory).env(env);

  return { directory, env };
}

test('it returns the merge base with origin/main when origin has no HEAD', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const base = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  expect(runGitMergeBase(ctx.directory, ctx.env)).toBe(base.trim());
});

test('it returns the merge base with the branch that origin/HEAD names', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the trunk'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/trunk HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/trunk`
    .cwd(ctx.directory)
    .env(ctx.env);

  const base = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  expect(runGitMergeBase(ctx.directory, ctx.env)).toBe(base.trim());
});

test('it throws when the repo has no default branch to start from', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  expect(() => runGitMergeBase(ctx.directory, ctx.env)).toThrowWithMessage(
    Error,
    'cannot find the base of this branch: no merge base between HEAD and origin/main (is the remote fetched?)',
  );
});
