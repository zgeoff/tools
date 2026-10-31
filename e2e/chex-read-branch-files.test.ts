import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitCommit } from '../test-utils/create-git-commit.ts';
import { readGitEnv } from '../test-utils/read-git-env.ts';
import { runGit } from '../test-utils/run-git.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-branch-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const upstream = join(directory, 'upstream.git');
  const repo = join(directory, 'work');

  await runGit(directory, env, ['init', '--quiet', '--bare', '--initial-branch=main', upstream]);
  await runGit(directory, env, ['clone', '--quiet', upstream, repo]);
  await runGit(repo, env, ['switch', '--quiet', '--create', 'main']);
  await createGitCommit(repo, env, {});
  await runGit(repo, env, ['push', '--quiet', '-u', 'origin', 'main']);
  await runGit(repo, env, ['remote', 'set-head', 'origin', 'main']);

  return {
    repo,
    env,
    runGit: (...args: readonly string[]) => runGit(repo, env, args),
    createCommit: (files: Readonly<Record<string, string>>) => createGitCommit(repo, env, files),
  };
}

test('it exits 1 with a message when run in a repository with no origin', async () => {
  const ctx = await setupTest();

  await ctx.runGit('remote', 'remove', 'origin');

  const run = Bun.spawnSync(
    [process.execPath, join(import.meta.dir, '../packages/chex/src/read-branch-files.ts')],
    {
      cwd: ctx.repo,
      env: ctx.env,
    },
  );

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

  const run = Bun.spawnSync(
    [process.execPath, join(import.meta.dir, '../packages/chex/src/read-branch-files.ts')],
    {
      cwd: ctx.repo,
      env: ctx.env,
    },
  );

  expect(run.exitCode).toBe(0);
  expect(run.stdout.toString()).toBe('a.ts\nb.ts\n');
});
