import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readlink, rm, utimes } from 'node:fs/promises';
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

  return { packageDir, builds: join(packageDir, chexPackDir, 'builds') };
}

test('it extracts the pack and points the package link at this build', async () => {
  const ctx = await setupTest();
  const linkPath = await runChexPack({ packageDir: ctx.packageDir, buildID: 'b1', now: Date.now });
  const target = await readlink(linkPath);

  expect(target).toBe(join('builds', 'b1', 'package'));
  expect(existsSync(join(linkPath, 'src/cli.ts'))).toBeTrue();
});

test("it keeps a recent build's files when a later build moves the link", async () => {
  const ctx = await setupTest();

  await runChexPack({ packageDir: ctx.packageDir, buildID: 'b1', now: Date.now });

  const linkPath = await runChexPack({ packageDir: ctx.packageDir, buildID: 'b2', now: Date.now });
  const target = await readlink(linkPath);

  expect(target).toBe(join('builds', 'b2', 'package'));
  expect(existsSync(join(ctx.builds, 'b1/package/src/cli.ts'))).toBeTrue();
});

test('it removes a build older than an hour', async () => {
  const ctx = await setupTest();

  await runChexPack({ packageDir: ctx.packageDir, buildID: 'b1', now: Date.now });

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  await utimes(join(ctx.builds, 'b1'), twoHoursAgo, twoHoursAgo);
  await runChexPack({ packageDir: ctx.packageDir, buildID: 'b2', now: Date.now });

  expect(existsSync(join(ctx.builds, 'b1'))).toBeFalse();
});
