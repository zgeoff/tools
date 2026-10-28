import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeFileSystem } from './node-file-system.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-node-file-system-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes a file in folders it creates and reads it back as text and bytes', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'kettle/spout/water.txt');

  await nodeFileSystem.writeText(path, 'hot\n');
  await nodeFileSystem.appendText(path, 'steam\n');

  const text = await nodeFileSystem.readText(path);
  const bytes = await nodeFileSystem.readBytes(path);

  expect(text).toBe('hot\nsteam\n');
  expect(bytes).toStrictEqual(new TextEncoder().encode('hot\nsteam\n'));
});

test('it lists a folder it created and probes a path before and after its removal', async () => {
  const ctx = await setupTest();

  const folder = join(ctx.directory, 'cups/blue');

  await nodeFileSystem.createDirectory(folder);

  const listed = await nodeFileSystem.readDirectory(join(ctx.directory, 'cups'));
  const before = await nodeFileSystem.probePath(folder);

  await nodeFileSystem.removePath(join(ctx.directory, 'cups'));

  const after = await nodeFileSystem.probePath(folder);

  expect(listed).toStrictEqual(['blue']);
  expect(before).toBeTrue();
  expect(after).toBeFalse();
});

test('it removes a missing path with no error', async () => {
  const ctx = await setupTest();

  await nodeFileSystem.removePath(join(ctx.directory, 'teapot'));

  const exists = await nodeFileSystem.probePath(join(ctx.directory, 'teapot'));

  expect(exists).toBeFalse();
});
