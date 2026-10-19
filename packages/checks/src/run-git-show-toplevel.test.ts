import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { runGitShowToplevel } from './run-git-show-toplevel.ts';

// A temp folder, and a clean git environment, so a GIT_DIR that a pre-push hook exports cannot
// point git at the repo this test runs in.
async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'run-git-show-toplevel-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  // git prints the resolved path, so a symlinked temp folder must resolve too.
  const directory = await realpath(created);

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: directory,
  };

  return { directory, env };
}

test('it returns the top of the work tree from a subfolder', async () => {
  const ctx = await setupTest();

  await $`git init --quiet repo`.cwd(ctx.directory).env(ctx.env);

  await mkdir(join(ctx.directory, 'repo/scripts/ci'), { recursive: true });

  expect(runGitShowToplevel(join(ctx.directory, 'repo/scripts/ci'), ctx.env)).toBe(
    join(ctx.directory, 'repo'),
  );
});

test('it returns the folder itself outside a work tree', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'loose'));

  expect(runGitShowToplevel(join(ctx.directory, 'loose'), ctx.env)).toBe(
    join(ctx.directory, 'loose'),
  );
});

test('it returns the folder itself when the PATH lacks git', async () => {
  const ctx = await setupTest();

  await $`git init --quiet repo`.cwd(ctx.directory).env(ctx.env);

  await mkdir(join(ctx.directory, 'repo/scripts'));

  expect(runGitShowToplevel(join(ctx.directory, 'repo/scripts'), { PATH: ctx.directory })).toBe(
    join(ctx.directory, 'repo/scripts'),
  );
});
