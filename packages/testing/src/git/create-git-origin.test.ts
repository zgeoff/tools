import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { createTempDir } from '../fs/create-temp-dir.ts';
import { createGitOrigin } from './create-git-origin.ts';
import { createGitRepo } from './create-git-repo.ts';
import { readGitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

function setupTest() {
  return { env: readGitEnv(createTempDir('git-home').path) };
}

test('it makes an empty bare repo', async () => {
  const ctx = setupTest();

  const origin = await createGitOrigin(ctx.env);
  const isBare = await runGit(origin.path, ctx.env, ['rev-parse', '--is-bare-repository']);
  const refs = await runGit(origin.path, ctx.env, ['for-each-ref']);

  expect({ isBare, refs }).toStrictEqual({ isBare: 'true\n', refs: '' });
});

test('it accepts any history as a first push, even to the branch that main names', async () => {
  const ctx = setupTest();

  const origin = await createGitOrigin(ctx.env);

  const repo = await createGitRepo(ctx.env, [
    { message: 'add app', files: { 'app.ts': 'export {};\n' } },
    { message: 'add readme', files: { 'README.md': '# app\n' } },
  ]);

  await runGit(repo.path, ctx.env, ['push', '--quiet', origin.path, 'main']);

  const head = await runGit(origin.path, ctx.env, ['rev-parse', 'main']);

  expect(head).toBe(`${repo.commits[1]}\n`);
});

test('it writes maintenance.auto=false into the config of the origin itself', async () => {
  const ctx = setupTest();

  const origin = await createGitOrigin(ctx.env);
  const value = await runGit(origin.path, ctx.env, ['config', '--local', 'maintenance.auto']);

  expect(value).toBe('false\n');
});

test('it removes the origin after the test', async () => {
  const ctx = setupTest();

  const origin = await createGitOrigin(ctx.env);

  onTestFinished(() => {
    expect(existsSync(origin.path)).toBeFalse();
  });
});

test('it leaves the origin in place after the test with cleanup manual', async () => {
  const ctx = setupTest();

  const origin = await createGitOrigin(ctx.env, { cleanup: 'manual' });

  onTestFinished(() => {
    const isThere = existsSync(origin.path);

    origin.remove();

    expect(isThere).toBeTrue();
  });
});
