import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { readBranchBase } from './read-branch-base.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-branch-base-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main`.cwd(directory).env(env);

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

  const found = await readBranchBase({ cwd: ctx.directory, env: ctx.env });

  expect(found).toBe(base.trim());
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

  const found = await readBranchBase({ cwd: ctx.directory, env: ctx.env });

  expect(found).toBe(base.trim());
});

test('it returns the common ancestor when the branch and the default branch diverge', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const base = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the trunk'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);
  await $`git reset --quiet --hard ${base.trim()}`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const found = await readBranchBase({ cwd: ctx.directory, env: ctx.env });

  expect(found).toBe(base.trim());
});

test('it rejects when the repo has no default branch to start from', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const rejection: unknown = await readBranchBase({ cwd: ctx.directory, env: ctx.env }).catch(
    (error: unknown) => error,
  );

  expect(rejection).toBeInstanceOf(Error);

  expect(rejection).toHaveProperty(
    'message',
    'cannot find the base of this branch: no merge base between HEAD and origin/main (is the remote fetched?)',
  );
});
