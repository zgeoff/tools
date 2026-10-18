import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { resolveRepoRoot } from './resolve-repo-root.ts';

// A temp folder, and a clean git environment, so a GIT_DIR that a pre-push hook exports cannot
// point git at the repo this test runs in.
async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'resolve-repo-root-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  // git prints the resolved path, so a symlinked temp folder must resolve too.
  const dir = await realpath(created);

  const env = {
    PATH: process.env['PATH'],
    HOME: dir,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: dir,
  };

  return { dir, env };
}

test('it returns the top of the work tree from a subfolder', async () => {
  const ctx = await setupTest();

  await $`git init --quiet repo`.cwd(ctx.dir).env(ctx.env);

  await mkdir(join(ctx.dir, 'repo/scripts/ci'), { recursive: true });

  expect(resolveRepoRoot(join(ctx.dir, 'repo/scripts/ci'), ctx.env)).toBe(join(ctx.dir, 'repo'));
});

test('it returns the folder itself outside a work tree', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'loose'));

  expect(resolveRepoRoot(join(ctx.dir, 'loose'), ctx.env)).toBe(join(ctx.dir, 'loose'));
});

test('it returns the folder itself when the PATH lacks git', async () => {
  const ctx = await setupTest();

  await $`git init --quiet repo`.cwd(ctx.dir).env(ctx.env);

  await mkdir(join(ctx.dir, 'repo/scripts'));

  expect(resolveRepoRoot(join(ctx.dir, 'repo/scripts'), { PATH: ctx.dir })).toBe(
    join(ctx.dir, 'repo/scripts'),
  );
});
