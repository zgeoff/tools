import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { laneFiles } from './lane-files.ts';
import { readDirNames } from './read-dir-names.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'rig-browser-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it creates a folder that only its user can open', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'chrome');

  await laneFiles.createPrivateDir(path);

  const status = await laneFiles.readStatus(path);

  expect(status).toStrictEqual({ isDirectory: true, ownerID: userInfo().uid, mode: 0o4_0700 });
});

test('it leaves a name that already exists as it is', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'chrome');

  await Bun.write(path, 'a file where the folder goes');
  await laneFiles.createPrivateDir(path);

  const text = await Bun.file(path).text();

  expect(text).toBe('a file where the folder goes');
});

test('it reports the status of a link itself, never of its target', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'chrome');

  await laneFiles.createPrivateDir(join(ctx.directory, 'target'));

  await symlink(join(ctx.directory, 'target'), path);

  const status = await laneFiles.readStatus(path);

  expect(status).toMatchObject({ isDirectory: false });
});

test('it reports no status for a path where nothing exists', async () => {
  const ctx = await setupTest();
  const status = await laneFiles.readStatus(join(ctx.directory, 'missing'));

  expect(status).toBeNull();
});

test('it reads the names in a folder with the shared folder reader', () => {
  expect(laneFiles.readDirNames).toBe(readDirNames);
});
