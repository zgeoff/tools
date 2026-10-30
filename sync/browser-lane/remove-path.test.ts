import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removePath } from './remove-path.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'remove-path-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it removes a folder with everything inside it', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'run', 'profiles', 'Local State'), '{}');

  await removePath(join(ctx.directory, 'run'));

  const entries = await readdir(ctx.directory);

  expect(entries).toStrictEqual([]);
});

test('it removes nothing, and fails nothing, for a path where nothing exists', async () => {
  const ctx = await setupTest();

  await removePath(join(ctx.directory, 'missing'));

  const entries = await readdir(ctx.directory);

  expect(entries).toStrictEqual([]);
});
