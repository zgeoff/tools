import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/std/test-utils/read-run-folder-prefix';
import { writeTreeFiles } from '@zgeoff/std/test-utils/write-tree-files';
import { chexPackDir, runChexPack } from './pack-chex-program.ts';

async function setupTest() {
  const packageDir = await mkdtemp(join(tmpdir(), readRunFolderPrefix('pack-chex-program-')));

  onTestFinished(() => rm(packageDir, { recursive: true, force: true }));

  await writeTreeFiles(packageDir, {
    'package.json': JSON.stringify({ name: 'kettle', version: '1.0.0', files: ['src'] }),
    'src/cli.ts': 'export {};\n',
  });

  const running = new Set<number>();

  const pack = (buildID: string, ownerPID: number) =>
    runChexPack({ packageDir, buildID, ownerPID, isRunning: (pid) => running.has(pid) });

  return { packageDir, builds: join(packageDir, chexPackDir, 'builds'), running, pack };
}

test('it extracts the pack and points the package link at this build', async () => {
  const ctx = await setupTest();
  const linkPath = await ctx.pack('b1', 101);
  const target = await readlink(linkPath);

  expect(target).toBe(join('builds', 'b1', 'package'));
  expect(existsSync(join(linkPath, 'src/cli.ts'))).toBeTrue();
});

test("it keeps a build's files while its rig process still runs", async () => {
  const ctx = await setupTest();

  ctx.running.add(101);

  await ctx.pack('b1', 101);

  const linkPath = await ctx.pack('b2', 202);
  const target = await readlink(linkPath);

  expect(target).toBe(join('builds', 'b2', 'package'));
  expect(existsSync(join(ctx.builds, 'b1/package/src/cli.ts'))).toBeTrue();
});

test('it removes a build whose rig process has stopped', async () => {
  const ctx = await setupTest();

  await ctx.pack('b1', 101);
  await ctx.pack('b2', 202);

  expect(existsSync(join(ctx.builds, 'b1'))).toBeFalse();
});

test('it removes a build folder that names no owner', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.builds, { 'stray/owner': 'none' });

  await ctx.pack('b1', 101);

  expect(existsSync(join(ctx.builds, 'stray'))).toBeFalse();
});

test('it skips a build folder that another build removes first', async () => {
  const ctx = await setupTest();

  const strays = Array.from({ length: 50 }, (_, index) => `stray-${index}/owner`);

  await writeTreeFiles(ctx.builds, Object.fromEntries(strays.map((path) => [path, '0'])));

  const results = await Promise.allSettled([ctx.pack('b1', 101), ctx.pack('b2', 202)]);

  expect(results.map((result) => result.status)).toStrictEqual(['fulfilled', 'fulfilled']);
});

test('it replaces a package folder that an older build extracted in place', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(join(ctx.packageDir, chexPackDir), { 'package/src/cli.ts': '' });
  await writeFile(join(ctx.packageDir, chexPackDir, 'package/README.md'), '');

  const linkPath = await ctx.pack('b1', 101);
  const target = await readlink(linkPath);

  expect(target).toBe(join('builds', 'b1', 'package'));
});
