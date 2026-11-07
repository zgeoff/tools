import { expect, onTestFinished, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readRunFolderPrefix } from '../test-utils/read-run-folder-prefix.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';

async function setupTest() {
  const checkout = await mkdtemp(join(tmpdir(), readRunFolderPrefix('run-knip-')));

  onTestFinished(() => rm(checkout, { recursive: true, force: true }));

  const worktree = join(checkout, '.worktrees', 'fix-branch');

  const knipPath = await realpath(join(import.meta.dir, '../../node_modules/.bin/knip'));

  await mkdir(join(worktree, 'scripts'), { recursive: true });
  await copyFile(join(import.meta.dir, 'run-knip.sh'), join(worktree, 'scripts', 'run-knip.sh'));

  return { checkout, worktree, knipPath, scriptPath: join(worktree, 'scripts', 'run-knip.sh') };
}

test('it passes a clean worktree inside a checkout whose tsconfig extends a package it lacks', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.checkout, {
    'tsconfig.json': '{ "extends": "@example/absent/tsconfig.json" }\n',
  });

  await writeTreeFiles(ctx.worktree, {
    'package.json': '{ "name": "lantern", "private": true, "type": "module" }\n',
    'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
    'knip.json': '{ "entry": ["src/main.ts"] }\n',
    'src/main.ts': 'console.log("lit");\n',
  });

  await mkdir(join(ctx.worktree, 'node_modules', '.bin'), { recursive: true });
  await symlink(ctx.knipPath, join(ctx.worktree, 'node_modules', '.bin', 'knip'));

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.worktree).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it passes a clean worktree whose node_modules links to the outer checkout', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.checkout, {
    'tsconfig.json': '{ "extends": "@example/absent/tsconfig.json" }\n',
  });

  await writeTreeFiles(ctx.worktree, {
    'package.json': '{ "name": "lantern", "private": true, "type": "module" }\n',
    'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
    'knip.json': '{ "entry": ["src/main.ts"] }\n',
    'src/main.ts': 'console.log("lit");\n',
  });

  await mkdir(join(ctx.checkout, 'node_modules', '.bin'), { recursive: true });
  await symlink(ctx.knipPath, join(ctx.checkout, 'node_modules', '.bin', 'knip'));
  await symlink(join(ctx.checkout, 'node_modules'), join(ctx.worktree, 'node_modules'));

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.worktree).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it reports an unused file of the worktree', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.checkout, {
    'tsconfig.json': '{ "extends": "@example/absent/tsconfig.json" }\n',
  });

  await writeTreeFiles(ctx.worktree, {
    'package.json': '{ "name": "lantern", "private": true, "type": "module" }\n',
    'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
    'knip.json': '{ "entry": ["src/main.ts"] }\n',
    'src/main.ts': 'console.log("lit");\n',
    'src/wick.ts': 'export const wick = "cotton";\n',
  });

  await mkdir(join(ctx.worktree, 'node_modules', '.bin'), { recursive: true });
  await symlink(ctx.knipPath, join(ctx.worktree, 'node_modules', '.bin', 'knip'));

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.worktree).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 1, stdout: 'Unused files (1)\nsrc/wick.ts\n', stderr: '' });
});

test('it passes its arguments to knip', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.checkout, {
    'tsconfig.json': '{ "extends": "@example/absent/tsconfig.json" }\n',
  });

  await writeTreeFiles(ctx.worktree, {
    'package.json': '{ "name": "lantern", "private": true, "type": "module" }\n',
    'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
    'knip.json': '{ "entry": ["src/main.ts"] }\n',
    'src/main.ts': 'console.log("lit");\n',
    'src/wick.ts': 'export const wick = "cotton";\n',
  });

  await mkdir(join(ctx.worktree, 'node_modules', '.bin'), { recursive: true });
  await symlink(ctx.knipPath, join(ctx.worktree, 'node_modules', '.bin', 'knip'));

  const result = await $`bash ${ctx.scriptPath} --include dependencies`
    .cwd(ctx.worktree)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});
