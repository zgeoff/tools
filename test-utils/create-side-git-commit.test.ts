import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createGitCommit } from './create-git-commit.ts';
import { createSideGitCommit } from './create-side-git-commit.ts';
import { readGitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-create-side-git-commit-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await runGit(directory, env, ['init', '--quiet', '-b', 'main']);

  return { directory, env };
}

test('it commits on the side branch and returns to the branch it left, which lacks the commit', async () => {
  const ctx = await setupTest();
  const base = await createGitCommit(ctx.directory, ctx.env, { 'notes.md': '# Notes\n' });

  const side = await createSideGitCommit(ctx.directory, ctx.env, {
    branch: 'side',
    files: { 'notes.md': '# Notes, on the side\n' },
  });

  const branch = Bun.spawnSync(['git', 'branch', '--show-current'], {
    cwd: ctx.directory,
    env: ctx.env,
  });

  const heads = Bun.spawnSync(['git', 'rev-parse', 'main', 'side'], {
    cwd: ctx.directory,
    env: ctx.env,
  });

  expect(branch.stdout.toString()).toBe('main\n');
  expect(heads.stdout.toString()).toBe(`${base}\n${side}\n`);
});
