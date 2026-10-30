import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createGitCommit } from './create-git-commit.ts';
import { readGitEnv } from './read-git-env.ts';
import { readGitHead } from './read-git-head.ts';
import { runGit } from './run-git.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-read-git-head-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await runGit(directory, env, ['init', '--quiet']);

  return { directory, env };
}

test('it reads the commit HEAD names', async () => {
  const ctx = await setupTest();
  const commit = await createGitCommit(ctx.directory, ctx.env, { 'notes.md': '# Notes\n' });
  const head = await readGitHead(ctx.directory, ctx.env);

  expect(head).toMatch(/^[0-9a-f]{40}$/u);
  expect(head).toBe(commit);
});

test('it throws with git error text in a repo with no commit', async () => {
  const ctx = await setupTest();

  const rejection = await readGitHead(ctx.directory, ctx.env).then(
    () => null,
    (error: unknown) => error,
  );

  expect(rejection).toBeInstanceOf(Error);
  expect(String(rejection)).toContain('git rev-parse HEAD failed');
});
