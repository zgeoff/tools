import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'write-tree-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes each file at its path, with the folders it needs', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'notes.md': '# Notes\n',
    'garden/beds/north.txt': 'kale\n',
  });

  const notes = await readFile(join(ctx.directory, 'notes.md'), 'utf8');
  const north = await readFile(join(ctx.directory, 'garden/beds/north.txt'), 'utf8');

  expect(notes).toBe('# Notes\n');
  expect(north).toBe('kale\n');
});

test('it replaces the content of a file that exists', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, { 'notes.md': '# Notes\n' });
  await writeTreeFiles(ctx.directory, { 'notes.md': '# Plans\n' });

  const notes = await readFile(join(ctx.directory, 'notes.md'), 'utf8');

  expect(notes).toBe('# Plans\n');
});
