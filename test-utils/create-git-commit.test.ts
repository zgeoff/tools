import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitCommit } from './create-git-commit.ts';
import { readGitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'create-git-commit-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await runGit(directory, env, ['init', '--quiet']);

  return { directory, env };
}

test('it commits the given files, nested ones included', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.directory, ctx.env, {
    'notes.md': '# Notes\n',
    'garden/north.txt': 'kale\n',
  });

  const result = Bun.spawnSync(['git', 'show', '--name-only', '--format=%an %s', 'HEAD'], {
    cwd: ctx.directory,
    env: ctx.env,
  });

  expect(result.stdout.toString()).toBe('Test change\n\ngarden/north.txt\nnotes.md\n');
});

test('it records a file removed since the last commit', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.directory, ctx.env, {
    'notes.md': '# Notes\n',
    'plans.md': '# Plans\n',
  });

  await rm(join(ctx.directory, 'plans.md'));
  await createGitCommit(ctx.directory, ctx.env, { 'notes.md': '# Notes, revised\n' });

  const result = Bun.spawnSync(['git', 'show', '--name-status', '--format=', 'HEAD'], {
    cwd: ctx.directory,
    env: ctx.env,
  });

  expect(result.stdout.toString()).toBe('M\tnotes.md\nD\tplans.md\n');
});
