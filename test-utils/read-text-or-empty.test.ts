import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextOrEmpty } from './read-text-or-empty.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-text-or-empty-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the text of a file that exists', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, { 'orders.log': 'one teapot\n' });

  const text = await readTextOrEmpty(join(ctx.directory, 'orders.log'));

  expect(text).toBe('one teapot\n');
});

test('it reads a missing file as empty text', async () => {
  const ctx = await setupTest();
  const text = await readTextOrEmpty(join(ctx.directory, 'orders.log'));

  expect(text).toBe('');
});

test('it rejects with the read error when the path is a folder', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, { 'orders/today.log': 'one teapot\n' });

  const read = readTextOrEmpty(join(ctx.directory, 'orders'));

  await expect(read).rejects.toMatchObject({ code: 'EISDIR' });
});
