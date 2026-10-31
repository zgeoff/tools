import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { makeAnswerQueue } from '../../../test-utils/make-answer-queue.ts';
import { readGitEnv } from '../../../test-utils/read-git-env.ts';
import { readBranchBase } from './read-branch-base.ts';
import type { ProgramResult, RunProgram } from './run-program.ts';
import { runProgram } from './run-program.ts';

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

  const found = readBranchBase({ cwd: ctx.directory, env: ctx.env, runProgram });

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

  const found = readBranchBase({ cwd: ctx.directory, env: ctx.env, runProgram });

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

  const found = readBranchBase({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(found).toBe(base.trim());
});

test('it throws when the repo has no default branch to start from', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  expect(() => readBranchBase({ cwd: ctx.directory, env: ctx.env, runProgram })).toThrow(
    new Error(
      'cannot find the base of this branch: no merge base between HEAD and origin/main (is the remote fetched?)',
    ),
  );
});

test('it returns the merge base that git reports with the branch origin/HEAD names', () => {
  const standIn = mock<RunProgram>(
    makeAnswerQueue<ProgramResult>([
      { exitCode: 0, stdout: 'origin/trunk\n', stderr: '' },
      { exitCode: 0, stdout: '5f3c1e0a9b7d\n', stderr: '' },
    ]),
  );

  const found = readBranchBase({
    cwd: '/srv/kettle',
    env: { HOME: '/home/kettle' },
    runProgram: standIn,
  });

  expect(found).toBe('5f3c1e0a9b7d');

  expect(standIn.mock.calls).toStrictEqual([
    [
      ['git', 'rev-parse', '--abbrev-ref', 'origin/HEAD'],
      { cwd: '/srv/kettle', env: { HOME: '/home/kettle' } },
    ],
    [
      ['git', 'merge-base', 'HEAD', 'origin/trunk'],
      { cwd: '/srv/kettle', env: { HOME: '/home/kettle' } },
    ],
  ]);
});

test('it throws when git finds no merge base with the branch origin/HEAD names', () => {
  const standIn = mock<RunProgram>(
    makeAnswerQueue<ProgramResult>([
      { exitCode: 0, stdout: 'origin/trunk\n', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
    ]),
  );

  expect(() =>
    readBranchBase({ cwd: '/srv/kettle', env: { HOME: '/home/kettle' }, runProgram: standIn }),
  ).toThrow(
    new Error(
      'cannot find the base of this branch: no merge base between HEAD and origin/trunk (is the remote fetched?)',
    ),
  );
});
