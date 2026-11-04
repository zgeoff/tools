import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix, writeTreeFiles } from '@zgeoff/testing/helpers';
import { chexPackDir, runChexPack } from './pack-chex-program.ts';

async function setupTest() {
  const packageDir = await mkdtemp(join(tmpdir(), readRunFolderPrefix('pack-chex-program-')));

  onTestFinished(() => rm(packageDir, { recursive: true, force: true }));

  await writeTreeFiles(packageDir, {
    'package.json': JSON.stringify({ name: 'kettle', version: '1.0.0', files: ['src'] }),
    'src/cli.ts': 'export {};\n',
  });

  const running = new Set<number>();

  const pack = (ownerPID: number) =>
    runChexPack({ packageDir, ownerPID, stamp: 's', isRunning: (pid) => running.has(pid) });

  return { packageDir, builds: join(packageDir, chexPackDir, 'builds'), running, pack };
}

test('it extracts the pack and points the package link at this build', async () => {
  const ctx = await setupTest();
  const linkPath = await ctx.pack(101);
  const target = await readlink(linkPath);

  expect(target).toBe(join('builds', '101-s', 'package'));
  expect(existsSync(join(linkPath, 'src/cli.ts'))).toBeTrue();
});

test("it keeps a build's files while its rig process still runs", async () => {
  const ctx = await setupTest();

  ctx.running.add(101);

  await ctx.pack(101);

  const linkPath = await ctx.pack(202);
  const target = await readlink(linkPath);

  expect(target).toBe(join('builds', '202-s', 'package'));
  expect(existsSync(join(ctx.builds, '101-s/package/src/cli.ts'))).toBeTrue();
});

test('it removes a build whose rig process has stopped', async () => {
  const ctx = await setupTest();

  await ctx.pack(101);
  await ctx.pack(202);

  expect(existsSync(join(ctx.builds, '101-s'))).toBeFalse();
});

test('it removes a build folder that names no owner', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.builds, { 'stray/chex.tgz': '' });

  await ctx.pack(101);

  expect(existsSync(join(ctx.builds, 'stray'))).toBeFalse();
});

test('it keeps a build that a running rig process has started but not yet packed', async () => {
  const ctx = await setupTest();

  ctx.running.add(303);

  await writeTreeFiles(ctx.builds, { '303-s/chex.tgz': '' });

  await ctx.pack(101);

  expect(existsSync(join(ctx.builds, '303-s'))).toBeTrue();
});

test('it skips a build folder that another build removes first', async () => {
  const ctx = await setupTest();

  // Both rig runs are alive, as they are when two builds overlap, so neither build removes the other.
  ctx.running.add(101);
  ctx.running.add(202);

  const strays = Array.from({ length: 50 }, (_, index) => `${9000 + index}-s/chex.tgz`);

  await writeTreeFiles(ctx.builds, Object.fromEntries(strays.map((path) => [path, ''])));

  const results = await Promise.allSettled([ctx.pack(101), ctx.pack(202)]);

  expect(results.map((result) => result.status)).toStrictEqual(['fulfilled', 'fulfilled']);
});

test('it replaces a package folder that an older build extracted in place', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(join(ctx.packageDir, chexPackDir), { 'package/src/cli.ts': '' });
  await writeFile(join(ctx.packageDir, chexPackDir, 'package/README.md'), '');

  const linkPath = await ctx.pack(101);
  const target = await readlink(linkPath);

  expect(target).toBe(join('builds', '101-s', 'package'));
});
