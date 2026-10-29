import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { runProgram } from './run-program.ts';
import { runUncommittedCheck } from './run-uncommitted-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-uncommitted-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const repo = join(directory, 'work');

  await runGit(directory, env, ['init', '--quiet', '--initial-branch=main', repo]);

  return {
    directory,
    repo,
    env,
    runGit: (...args: readonly string[]) => runGit(repo, env, args),
    createCommit: (files: Readonly<Record<string, string>>) => createGitCommit(repo, env, files),
  };
}

test('it returns a file the push sends that holds an unstaged change', async () => {
  const ctx = await setupTest();

  await ctx.createCommit({ 'guide.md': '# Guide\n' });

  await writeFile(join(ctx.repo, 'guide.md'), '# Guide\n\nA new line.\n');

  const changed = runUncommittedCheck({
    cwd: ctx.repo,
    env: ctx.env,
    files: ['guide.md'],
    runProgram,
  });

  expect(changed).toStrictEqual(['guide.md']);
});

test('it returns a file the push sends that holds a staged change', async () => {
  const ctx = await setupTest();

  await ctx.createCommit({ 'guide.md': '# Guide\n' });

  await writeFile(join(ctx.repo, 'guide.md'), '# Guide\n\nA new line.\n');

  await ctx.runGit('add', 'guide.md');

  const changed = runUncommittedCheck({
    cwd: ctx.repo,
    env: ctx.env,
    files: ['guide.md'],
    runProgram,
  });

  expect(changed).toStrictEqual(['guide.md']);
});

test('it returns a file the push deletes that is restored on disk', async () => {
  const ctx = await setupTest();

  await ctx.createCommit({ 'helper.ts': 'export {};\n' });
  await ctx.runGit('rm', '--quiet', 'helper.ts');
  await ctx.runGit('commit', '--quiet', '-m', 'remove the helper');
  await ctx.runGit('checkout', 'HEAD~1', '--', 'helper.ts');

  const changed = runUncommittedCheck({
    cwd: ctx.repo,
    env: ctx.env,
    files: ['helper.ts'],
    runProgram,
  });

  expect(changed).toStrictEqual(['helper.ts']);
});

test('it returns nothing when only a file outside the push holds a change', async () => {
  const ctx = await setupTest();

  await ctx.createCommit({ 'guide.md': '# Guide\n', 'notes.md': '# Notes\n' });

  await writeFile(join(ctx.repo, 'notes.md'), '# Notes\n\nA line in progress.\n');

  const changed = runUncommittedCheck({
    cwd: ctx.repo,
    env: ctx.env,
    files: ['guide.md'],
    runProgram,
  });

  expect(changed).toStrictEqual([]);
});

test('it throws the git error when the folder is not a repository', async () => {
  const ctx = await setupTest();

  expect(() =>
    runUncommittedCheck({ cwd: ctx.directory, env: ctx.env, files: ['guide.md'], runProgram }),
  ).toThrow(/^git diff failed: /u);
});
