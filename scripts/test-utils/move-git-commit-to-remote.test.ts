import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createGitCommit } from './create-git-commit.ts';
import { moveGitCommitToRemote } from './move-git-commit-to-remote.ts';
import { readGitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-move-git-commit-to-remote-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const checkout = join(directory, 'checkout');

  await runGit(directory, env, ['init', '--quiet', checkout]);

  return { directory, env, checkout };
}

test('it leaves the commit on main of the new remote and gone from the checkout', async () => {
  const ctx = await setupTest();
  const keep = await createGitCommit(ctx.checkout, ctx.env, { 'notes.md': '# Notes\n' });
  const moved = await createGitCommit(ctx.checkout, ctx.env, { 'notes.md': '# Notes, moved\n' });

  const remote = join(ctx.directory, 'remote.git');

  await moveGitCommitToRemote(ctx.checkout, ctx.env, { commit: moved, keep, remote });

  const local = Bun.spawnSync(['git', 'cat-file', '-e', moved], {
    cwd: ctx.checkout,
    env: ctx.env,
  });

  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ctx.checkout, env: ctx.env });
  const remoteMain = Bun.spawnSync(['git', 'rev-parse', 'main'], { cwd: remote, env: ctx.env });

  expect(local.exitCode).not.toBe(0);
  expect(head.stdout.toString()).toBe(`${keep}\n`);
  expect(remoteMain.stdout.toString()).toBe(`${moved}\n`);
});
