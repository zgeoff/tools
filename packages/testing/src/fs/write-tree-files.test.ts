import { expect, test } from 'bun:test';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDir } from './create-temp-dir.ts';
import { writeTreeFiles } from './write-tree-files.ts';

function setupTest() {
  return { directory: createTempDir('write-tree-files').path };
}

test('it writes each file at its path, with the folders it needs', async () => {
  const ctx = setupTest();

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
  const ctx = setupTest();

  await writeTreeFiles(ctx.directory, { 'notes.md': '# Notes\n' });
  await writeTreeFiles(ctx.directory, { 'notes.md': '# Plans\n' });

  const notes = await readFile(join(ctx.directory, 'notes.md'), 'utf8');

  expect(notes).toBe('# Plans\n');
});

test('it deletes the file that a null entry names', async () => {
  const ctx = setupTest();

  await writeTreeFiles(ctx.directory, { 'old.txt': 'stale\n', 'keep.txt': 'fresh\n' });
  await writeTreeFiles(ctx.directory, { 'old.txt': null });

  expect({
    old: existsSync(join(ctx.directory, 'old.txt')),
    keep: existsSync(join(ctx.directory, 'keep.txt')),
  }).toStrictEqual({ old: false, keep: true });
});

test('it takes a null entry for a file that is not there as no error', async () => {
  const ctx = setupTest();

  await writeTreeFiles(ctx.directory, { 'missing/never.txt': null });

  expect(existsSync(join(ctx.directory, 'missing/never.txt'))).toBeFalse();
});

test('it writes a symlink with the target as given, and makes its folder', async () => {
  const ctx = setupTest();

  await writeTreeFiles(ctx.directory, {
    'config/app.json': '{"port":4310}\n',
    'config/current': { symlink: 'app.json' },
  });

  const link = join(ctx.directory, 'config/current');

  expect({
    isLink: lstatSync(link).isSymbolicLink(),
    target: readlinkSync(link),
    content: readFileSync(link, 'utf8'),
  }).toStrictEqual({ isLink: true, target: 'app.json', content: '{"port":4310}\n' });
});

test('it replaces a file at the path of a symlink entry', async () => {
  const ctx = setupTest();

  await writeFile(join(ctx.directory, 'current'), 'a plain file\n');
  await writeTreeFiles(ctx.directory, { current: { symlink: 'elsewhere' } });

  expect(readlinkSync(join(ctx.directory, 'current'))).toBe('elsewhere');
});

test('it replaces a symlink at the path of a symlink entry', async () => {
  const ctx = setupTest();

  await mkdir(join(ctx.directory, 'config'));
  await symlink('first', join(ctx.directory, 'config/current'));
  await writeTreeFiles(ctx.directory, { 'config/current': { symlink: 'second' } });

  expect(readlinkSync(join(ctx.directory, 'config/current'))).toBe('second');
});
