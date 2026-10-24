import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { readBranchFiles } from './read-branch-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-branch-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const upstream = join(directory, 'upstream.git');
  const repo = join(directory, 'work');

  await runGit(directory, env, ['init', '--quiet', '--bare', '--initial-branch=main', upstream]);
  await runGit(directory, env, ['clone', '--quiet', upstream, repo]);
  await runGit(repo, env, ['switch', '--quiet', '--create', 'main']);
  await createGitCommit(repo, env, { 'README.md': '# repo\n' });
  await runGit(repo, env, ['push', '--quiet', '-u', 'origin', 'main']);
  await runGit(repo, env, ['remote', 'set-head', 'origin', 'main']);

  return {
    repo,
    env,
    runGit: (...args: readonly string[]) => runGit(repo, env, args),
    createCommit: (files: Readonly<Record<string, string>>) => createGitCommit(repo, env, files),
  };
}

test('it lists the files a new branch with no upstream changes', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a', 'b.ts': 'b' });

  const files = await readBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toIncludeSameMembers(['a.ts', 'b.ts']);
});

test('it lists only the branch files once the branch is pushed with an upstream', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a' });
  await ctx.runGit('push', '--quiet', '-u', 'origin', 'feature');

  const files = await readBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['a.ts']);
});

test('it leaves out the files main gained after the branch started', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a' });
  await ctx.runGit('switch', '--quiet', 'main');
  await ctx.createCommit({ 'main.ts': 'main' });
  await ctx.runGit('push', '--quiet', 'origin', 'main');
  await ctx.runGit('switch', '--quiet', 'feature');

  const files = await readBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['a.ts']);
});

test('it lists nothing when the branch has no commits of its own', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');

  const files = await readBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toBeEmpty();
});

test('it leaves out a file the branch deleted', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.runGit('rm', '--quiet', 'README.md');
  await ctx.createCommit({ 'a.ts': 'a' });

  const files = await readBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['a.ts']);
});

test('it lists the new path of a file the branch renamed', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.runGit('mv', 'README.md', 'GUIDE.md');
  await ctx.runGit('commit', '--quiet', '-m', 'rename');

  const files = await readBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['GUIDE.md']);
});

test('it falls back to origin/main when origin/HEAD is unset', async () => {
  const ctx = await setupTest();

  await ctx.runGit('remote', 'set-head', 'origin', '--delete');
  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a' });

  const files = await readBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['a.ts']);
});

test('it rejects a repository with no origin', async () => {
  const ctx = await setupTest();

  await ctx.runGit('remote', 'remove', 'origin');

  const rejection: unknown = await readBranchFiles({ cwd: ctx.repo, env: ctx.env }).catch(
    (error: unknown) => error,
  );

  expect(rejection).toBeInstanceOf(Error);

  expect(rejection).toHaveProperty(
    'message',
    expect.toStartWith('cannot find the base of this branch'),
  );
});

test('it exits 1 with a message when run in a repository with no origin', async () => {
  const ctx = await setupTest();

  await ctx.runGit('remote', 'remove', 'origin');

  const run = Bun.spawnSync([process.execPath, join(import.meta.dir, 'read-branch-files.ts')], {
    cwd: ctx.repo,
    env: ctx.env,
  });

  expect(run.exitCode).toBe(1);
  expect(run.stdout.toString()).toBeEmpty();

  expect(run.stderr.toString()).toStartWith(
    'read-branch-files: cannot find the base of this branch',
  );
});

test('it prints one file per line when run on a branch', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a', 'b.ts': 'b' });

  const run = Bun.spawnSync([process.execPath, join(import.meta.dir, 'read-branch-files.ts')], {
    cwd: ctx.repo,
    env: ctx.env,
  });

  expect(run.exitCode).toBe(0);
  expect(run.stdout.toString()).toBe('a.ts\nb.ts\n');
});
