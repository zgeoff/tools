import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

// The package packed and installed from its tarball into a fresh git repo. Every build and pack
// writes under the test's own folder, never the shared dist, so overlapping runs cannot race.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'checks-package-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // A clean git environment keeps a hook's GIT_DIR out, and the real HOME keeps bun install on the
  // shared cache.
  const env = {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  const unpacked = join(dir, 'unpacked');
  const packed = join(dir, 'packed');
  const project = join(dir, 'project');

  await Promise.all([mkdir(unpacked), mkdir(packed), mkdir(project)]);

  // The source pack runs no build; it gives the published manifest, with catalog versions resolved.
  await $`bun pm pack --ignore-scripts --destination ${dir}`
    .cwd(import.meta.dir)
    .env(env)
    .quiet();

  const entries = await readdir(dir);

  const manifest = entries.find((name) => name.endsWith('.tgz'));

  invariant(manifest !== undefined, 'bun pm pack wrote no tarball');

  await $`tar -xzf ${join(dir, manifest)} -C ${unpacked}`.env(env).quiet();

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

  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'project',
      private: true,
      scripts: { check: 'zgeoff-check' },
      devDependencies: { '@zgeoff/checks': `file:${join(packed, tarball)}` },
    }),
  );

  await $`bun install`.cwd(project).env(env).quiet();
  await $`git init --quiet`.cwd(project).env(env);

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
