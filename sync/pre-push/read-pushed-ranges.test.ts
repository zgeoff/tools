import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { parsePushedRefs, readPushedRanges, readRangeCommits } from './read-pushed-ranges.ts';
import { runProgram } from './run-program.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-pushed-ranges-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main`.cwd(directory).env(env);

  return { directory, env };
}

test('it parses the local and remote commit of a ref that the push updates', () => {
  const refs = parsePushedRefs(
    'refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 2222222222222222222222222222222222222222\n',
  );

  expect(refs).toStrictEqual([
    {
      localSha: '1111111111111111111111111111111111111111',
      remoteSha: '2222222222222222222222222222222222222222',
    },
  ]);
});

test('it parses a null remote commit for a ref that the push creates', () => {
  const refs = parsePushedRefs(
    `refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000\n`,
  );

  expect(refs).toStrictEqual([
    { localSha: '1111111111111111111111111111111111111111', remoteSha: null },
  ]);
});

test('it leaves out a ref that the push deletes', () => {
  const refs = parsePushedRefs(
    [
      `(delete) 0000000000000000000000000000000000000000 refs/heads/farewell 3333333333333333333333333333333333333333`,
      `refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000`,
      '',
    ].join('\n'),
  );

  expect(refs).toStrictEqual([
    { localSha: '1111111111111111111111111111111111111111', remoteSha: null },
  ]);
});

test('it throws on a line that holds fewer than four fields', () => {
  expect(() =>
    parsePushedRefs('refs/heads/greeting 1111111111111111111111111111111111111111\n'),
  ).toThrow(
    'cannot read the pushed ref line: refs/heads/greeting 1111111111111111111111111111111111111111',
  );
});

test('it returns the range from the branch base to HEAD outside a push', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const base = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const ranges = readPushedRanges({
    cwd: ctx.directory,
    env: ctx.env,
    runProgram,
    pushedRefs: null,
  });

  expect(ranges).toStrictEqual([[`${base.trim()}..HEAD`]]);
});

test('it leaves out the default branch from the range of a ref that the push creates', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const ranges = readPushedRanges({
    cwd: ctx.directory,
    env: ctx.env,
    runProgram,
    pushedRefs: `refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000\n`,
  });

  expect(ranges).toStrictEqual([['1111111111111111111111111111111111111111', '^origin/main']]);
});

test('it leaves out the branch that origin/HEAD names', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/trunk HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/trunk`
    .cwd(ctx.directory)
    .env(ctx.env);

  const ranges = readPushedRanges({
    cwd: ctx.directory,
    env: ctx.env,
    runProgram,
    pushedRefs: `refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000\n`,
  });

  expect(ranges).toStrictEqual([['1111111111111111111111111111111111111111', '^origin/trunk']]);
});

test('it leaves out the remote commit from the range of a ref that the push updates', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const remoteText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const remote = remoteText.trim();

  const ranges = readPushedRanges({
    cwd: ctx.directory,
    env: ctx.env,
    runProgram,
    pushedRefs: `refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting ${remote}\n`,
  });

  expect(ranges).toStrictEqual([
    ['1111111111111111111111111111111111111111', '^origin/main', `^${remote}`],
  ]);
});

test('it keeps the remote commit out of the range when this clone lacks it', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const ranges = readPushedRanges({
    cwd: ctx.directory,
    env: ctx.env,
    runProgram,
    pushedRefs:
      'refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 2222222222222222222222222222222222222222\n',
  });

  expect(ranges).toStrictEqual([['1111111111111111111111111111111111111111', '^origin/main']]);
});

test('it returns no range for a push that only deletes refs', async () => {
  const ctx = await setupTest();

  const ranges = readPushedRanges({
    cwd: ctx.directory,
    env: ctx.env,
    runProgram,
    pushedRefs: `(delete) 0000000000000000000000000000000000000000 refs/heads/farewell 3333333333333333333333333333333333333333\n`,
  });

  expect(ranges).toStrictEqual([]);
});

test('it throws when the clone holds no default branch of origin', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  expect(() =>
    readPushedRanges({
      cwd: ctx.directory,
      env: ctx.env,
      runProgram,
      pushedRefs: `refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000\n`,
    }),
  ).toThrow(
    "cannot find origin's default branch: origin/main is not a commit (is the remote fetched?)",
  );
});

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
