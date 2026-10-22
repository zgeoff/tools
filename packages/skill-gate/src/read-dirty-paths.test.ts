import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readDirtyPaths } from './read-dirty-paths.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-dirty-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // git reads no user config without HOME, so the commits stay unsigned and need no identity.
  const gitEnv = {
    PATH: process.env['PATH'],
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  };

  return { directory, gitEnv };
}

test('it lists modified, untracked and renamed paths from the work tree root', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');

  await mkdir(join(repo, 'src'), { recursive: true });
  await writeFile(join(repo, 'src/kept.ts'), 'export const kept = 1;\n');
  await writeFile(join(repo, 'src/old.test.ts'), "test('it rounds', () => {});\n");

  await $`git init --quiet && git add -A && git commit --quiet -m init`.cwd(repo).env(ctx.gitEnv);

  await writeFile(join(repo, 'src/kept.ts'), 'export const kept = 2;\n');
  await writeFile(join(repo, 'src/new file.test.ts'), "test('it trims', () => {});\n");

  await $`git mv src/old.test.ts src/moved.test.ts`.cwd(repo).env(ctx.gitEnv);

  const dirty = await readDirtyPaths(join(repo, 'src'));

  expect(dirty).toIncludeSameMembers([
    join(repo, 'src/kept.ts'),
    join(repo, 'src/new file.test.ts'),
    join(repo, 'src/moved.test.ts'),
    join(repo, 'src/old.test.ts'),
  ]);
});

test('it keeps the path spelling of a work tree reached through a symlink', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');
  const link = join(ctx.directory, 'link');

  await mkdir(join(repo, 'src'), { recursive: true });

  await $`git init --quiet`.cwd(repo).env(ctx.gitEnv);

  await writeFile(join(repo, 'src/a.test.ts'), "test('it pads', () => {});\n");
  await symlink(repo, link);

  const dirty = await readDirtyPaths(link);

  expect(dirty).toStrictEqual([join(link, 'src/a.test.ts')]);
});

test('it reads null outside a git work tree', async () => {
  const ctx = await setupTest();
  const dirty = await readDirtyPaths(ctx.directory);

  expect(dirty).toBeNull();
});
