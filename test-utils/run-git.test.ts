import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-git-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, env: readGitEnv(directory) };
}

test('it runs git in the given directory', async () => {
  const ctx = await setupTest();

  await runGit(ctx.directory, ctx.env, ['init', '--quiet']);

  expect(existsSync(join(ctx.directory, '.git'))).toBeTrue();
});

test('it throws with the command and git error output when git fails', async () => {
  const ctx = await setupTest();

  expect(runGit(ctx.directory, ctx.env, ['rev-parse', 'HEAD'])).rejects.toThrow(
    /^git rev-parse HEAD failed: fatal: not a git repository/u,
  );
});
