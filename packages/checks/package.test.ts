import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

// The package built, packed, and installed from its tarball into a fresh git repo. A clean git
// environment keeps a hook's GIT_DIR out, and the real HOME keeps bun install on the shared cache.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'checks-package-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  const project = join(dir, 'project');

  await mkdir(project);

  await $`bun run build`
    .cwd(import.meta.dir)
    .env(env)
    .quiet();

  await $`bun pm pack --destination ${dir}`
    .cwd(import.meta.dir)
    .env(env)
    .quiet();

  const entries = await readdir(dir);

  const tarball = entries.find((name) => name.endsWith('.tgz'));

  invariant(tarball !== undefined, 'bun pm pack wrote no tarball');

  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'project',
      private: true,
      scripts: { check: 'zgeoff-check' },
      devDependencies: { '@zgeoff/checks': `file:${join(dir, tarball)}` },
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
