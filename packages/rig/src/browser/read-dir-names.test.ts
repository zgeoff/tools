import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDirNames } from './read-dir-names.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'rig-dir-names-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the names in a folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'profiles'));

  await Bun.write(join(ctx.directory, 'notes.txt'), 'buy milk');

  const names = await readDirNames(ctx.directory);

  expect(names).toIncludeSameMembers(['profiles', 'notes.txt']);
});

test('it reads no names for a path where nothing exists', async () => {
  const ctx = await setupTest();
  const names = await readDirNames(join(ctx.directory, 'missing'));

  expect(names).toStrictEqual([]);
});

test('it fails to read the names in a path that is no folder', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'notes.txt');

  await Bun.write(path, 'buy milk');

  expect(readDirNames(path)).rejects.toMatchObject({ code: 'ENOTDIR' });
});
