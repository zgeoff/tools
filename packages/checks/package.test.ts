import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

// The package packed and installed from its tarball into a fresh git repo. Every build and pack
// writes under the test's own folder, never the shared dist, so overlapping runs cannot race.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'checks-package-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // A clean git environment keeps a hook's GIT_DIR out, and the real HOME keeps bun install on the
  // shared cache.
  const env = {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.com',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.com',
  };

  const unpacked = join(directory, 'unpacked');
  const packed = join(directory, 'packed');
  const project = join(directory, 'project');

  await Promise.all([mkdir(unpacked), mkdir(packed), mkdir(project)]);

  // The source pack runs no build; it gives the published manifest, with catalog versions resolved.
  await $`bun pm pack --ignore-scripts --destination ${directory}`
    .cwd(import.meta.dir)
    .env(env)
    .quiet();

  const entries = await readdir(directory);

  const manifest = entries.find((name) => name.endsWith('.tgz'));

  invariant(manifest !== undefined, 'bun pm pack wrote no tarball');

  await $`tar -xzf ${join(directory, manifest)} -C ${unpacked}`.env(env).quiet();

  await rm(join(unpacked, 'package/dist'), { recursive: true, force: true });

  await $`bun run build:outdir ${join(unpacked, 'package/dist')}`
    .cwd(import.meta.dir)
    .env(env)
    .quiet();

  await $`bun pm pack --ignore-scripts --destination ${packed}`
    .cwd(join(unpacked, 'package'))
    .env(env)
    .quiet();

  const [tarball, ...extra] = await readdir(packed);

  invariant(tarball !== undefined && extra.length === 0, 'bun pm pack must write one tarball');

  // The repo installs commitlint itself, at the version the workspace pins.
  const commitlintVersion =
    await $`${join(import.meta.dir, '../../node_modules/.bin/commitlint')} --version`
      .env(env)
      .text();

  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'project',
      private: true,
      scripts: { check: 'zgeoff-check' },
      devDependencies: {
        '@commitlint/cli': commitlintVersion.trim().replace('@commitlint/cli@', ''),
        '@zgeoff/checks': `file:${join(packed, tarball)}`,
      },
    }),
  );

  await $`bun install`.cwd(project).env(env).quiet();
  await $`git init --quiet`.cwd(project).env(env);

  // An empty first commit stands for origin's default branch, so the branch has a base.
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(project).env(env);
  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(project).env(env);

  return { project, env };
}

test('it exits 0 through the installed bin when no script has a problem', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.project, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  await $`git add clean.sh`.cwd(ctx.project).env(ctx.env);

  const result = await $`bun run check`.cwd(ctx.project).env(ctx.env).nothrow().quiet();

  expect(result.exitCode).toBe(0);
});

test('it exits 1 through the installed bin and prints the finding for an unquoted variable', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.project, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add unquoted.sh`.cwd(ctx.project).env(ctx.env);

  const result = await $`bun run check`.cwd(ctx.project).env(ctx.env).nothrow().quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    'unquoted.sh:2: shell: shellcheck note: Double quote to prevent globbing and word splitting. [SC2086]\n',
  );
});

test('it exits 1 through the installed bin and prints the problems of a commit that is not a Conventional Commit', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'tidy up'}`.cwd(ctx.project).env(ctx.env);

  const hash = await $`git rev-parse --short HEAD`.cwd(ctx.project).env(ctx.env).text();
  const result = await $`bun run check`.cwd(ctx.project).env(ctx.env).nothrow().quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: [
      `${hash.trim()}:1: commits: commitlint: subject may not be empty [subject-empty]`,
      `${hash.trim()}:1: commits: commitlint: type may not be empty [type-empty]`,
      '',
    ].join('\n'),
  });
});
