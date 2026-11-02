import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createTrackedGitCommit } from './create-tracked-git-commit.ts';
import { readGitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-create-tracked-git-commit-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await runGit(directory, env, ['init', '--quiet']);

  return { directory, env };
}

test('it points the remote-tracking main at the new commit and returns it', async () => {
  const ctx = await setupTest();
  const commit = await createTrackedGitCommit(ctx.directory, ctx.env, { 'notes.md': '# Notes\n' });

  const result = Bun.spawnSync(['git', 'rev-parse', 'refs/remotes/origin/main'], {
    cwd: ctx.directory,
    env: ctx.env,
  });

  expect(result.stdout.toString()).toBe(`${commit}\n`);
});
