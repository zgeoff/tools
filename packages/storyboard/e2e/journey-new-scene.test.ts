import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { createTrackedRepo } from '@zgeoff/rig/test-utils/create-tracked-repo';
import { readRunFolderPrefix } from '@zgeoff/testing/fs';
import { readGitEnv, runGit } from '@zgeoff/testing/git';
import { run } from '@zgeoff/testing/process';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const repoRoot = await mkdtemp(join(tmpdir(), readRunFolderPrefix('storyboard-new-')));

  stack.defer(() => rm(repoRoot, { recursive: true, force: true }));

  // Chrome's socket path must fit a Unix socket address, so the lane gets a short TMPDIR.
  const laneTmpdir = await mkdtemp(join(tmpdir(), readRunFolderPrefix('sb-')));

  stack.defer(() => rm(laneTmpdir, { recursive: true, force: true }));

  const storyboard = await resolveProgram('storyboard');
  const rig = await resolveProgram('rig');

  const gitEnv = readGitEnv(repoRoot);
  const packagesDir = join(import.meta.dir, '..', '..');

  const runStoryboard = (args: readonly string[]) =>
    run(storyboard.command, { args: [...args], cwd: repoRoot });

  return {
    repoRoot,
    runStoryboard,
    runUnitSuite: () =>
      run(['bun'], { args: ['test', 'scripts/storyboard/storyboard.test.ts'], cwd: repoRoot }),
    runBrowserLane: () =>
      run(rig.command, { args: ['browser'], cwd: repoRoot, env: { TMPDIR: laneTmpdir } }),

    // What `bun add -d @zgeoff/storyboard @zgeoff/rig` leaves in a repo, linked to this checkout.
    createEmptyRepo: async () => {
      await createTrackedRepo(repoRoot, {
        'package.json': '{"name":"demo-repo","private":true}\n',
      });

      await mkdir(join(repoRoot, 'node_modules', '@zgeoff'), { recursive: true });

      await symlink(
        join(packagesDir, 'storyboard'),
        join(repoRoot, 'node_modules/@zgeoff/storyboard'),
      );

      await symlink(join(packagesDir, 'rig'), join(repoRoot, 'node_modules/@zgeoff/rig'));
    },
    stageFiles: () => runGit(repoRoot, gitEnv, ['add', '-A', '--force']),
  };
}

test('#storyboard new writes a scene, the two suites and the build script, and exits 0', async () => {
  const ctx = await setupTest();

  await ctx.createEmptyRepo();

  const result = await ctx.runStoryboard(['new', 'demo']);

  const written = await Promise.all(
    ['scene.tsx', 'tokens.ts', 'kit.ts'].map((name) =>
      Bun.file(join(ctx.repoRoot, 'scripts/storyboard/demo', name)).exists(),
    ),
  );

  expect({ exitCode: result.exitCode, written }).toStrictEqual({
    exitCode: 0,
    written: [true, true, true],
  });
});

test('#storyboard new writes a scene that builds and passes the unit suite', async () => {
  const ctx = await setupTest();

  await ctx.createEmptyRepo();
  await ctx.runStoryboard(['new', 'demo']);
  await ctx.stageFiles();
  await ctx.runStoryboard(['build']);

  const result = await ctx.runUnitSuite();

  expect(result.exitCode).toBe(0);
});

test('#storyboard new writes a scene that passes the browser suite', async () => {
  const ctx = await setupTest();

  await ctx.createEmptyRepo();
  await ctx.runStoryboard(['new', 'demo']);
  await ctx.runStoryboard(['build']);
  await ctx.stageFiles();

  const result = await ctx.runBrowserLane();

  expect(result.exitCode).toBe(0);
});
