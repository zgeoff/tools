import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lockFileWrites } from './lock-file-writes.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'lock-file-writes-'));

  const unlocks: (() => Promise<void>)[] = [];

  // A locked file blocks the folder's removal, so each unlock runs first.
  onTestFinished(async () => {
    await Promise.all(unlocks.map((unlock) => unlock()));

    await rm(directory, { recursive: true, force: true });
  });

  const lock = async (path: string) => {
    const unlock = await lockFileWrites(path);

    unlocks.push(unlock);

    return unlock;
  };

  return { directory, lock };
}

test('it keeps the file readable and refuses a write while locked', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'kettle.json');

  await writeFile(path, '{"boiled":false}');

  await ctx.lock(path);

  const text = await readFile(path, 'utf8');

  const write = writeFile(path, '{"boiled":true}');

  expect(text).toBe('{"boiled":false}');
  expect(write).rejects.toThrow();
});

test('it lets the file take a write after the unlock', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'kettle.json');

  await writeFile(path, '{"boiled":false}');

  const unlock = await ctx.lock(path);

  await unlock();
  await writeFile(path, '{"boiled":true}');

  const text = await readFile(path, 'utf8');

  expect(text).toBe('{"boiled":true}');
});

test('it unlocks a file that has gone since the lock', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'kettle.json');

  await writeFile(path, '{"boiled":false}');

  const unlock = await ctx.lock(path);

  await unlock();
  await rm(path);

  const unlocked = unlock();

  expect(unlocked).resolves.toBeUndefined();
});
