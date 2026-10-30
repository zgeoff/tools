import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { laneFiles } from './lane-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'browser-lane-files-'));

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

test('it reports no status, and no names, for a path where nothing exists', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'missing');

  const status = await laneFiles.readStatus(path);
  const names = await laneFiles.readDirNames(path);

  expect(status).toBeNull();
  expect(names).toStrictEqual([]);
});

test('it fails to read the names in a path that is no folder', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'notes.txt');

  await Bun.write(path, 'buy milk');

  const names = laneFiles.readDirNames(path);

  const failure = await names.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ code: 'ENOTDIR' });
});
