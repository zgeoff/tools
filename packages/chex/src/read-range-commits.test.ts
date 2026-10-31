import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../../test-utils/read-git-env.ts';
import { readRangeCommits } from './read-range-commits.ts';
import { runProgram } from './run-program.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-range-commits-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main`.cwd(directory).env(env);

  return { directory, env };
}

test('it lists a commit that two ranges share once', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const sharedText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git switch --quiet -c farewell`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the farewell'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const farewellText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const commits = readRangeCommits({ cwd: ctx.directory, env: ctx.env, runProgram }, [
    ['main', '^origin/main'],
    ['farewell', '^origin/main'],
  ]);

  expect(commits).toStrictEqual([sharedText.trim(), farewellText.trim()]);
});

test('it keeps the exclusions of each range to that range', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const greetingText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const greeting = greetingText.trim();

  await $`git commit --quiet --allow-empty -m ${'feat: add the farewell'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const farewellText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const farewell = farewellText.trim();

  // A new ref at the greeting, and a ref that moves from the greeting to the farewell.
  const commits = readRangeCommits({ cwd: ctx.directory, env: ctx.env, runProgram }, [
    [greeting, '^origin/main'],
    [farewell, '^origin/main', `^${greeting}`],
  ]);

  expect(commits).toStrictEqual([greeting, farewell]);
});
