import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDirNames } from '../packages/rig/src/browser/read-dir-names.ts';
import { templateFiles } from './template-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'template-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test("it lists the names in a folder with rig's folder reader", () => {
  expect(templateFiles.readDirectoryNames).toBe(readDirNames);
});

test('it moves a folder into place, and refuses a move onto a folder that holds files', async () => {
  const ctx = await setupTest();

  const first = join(ctx.directory, 'notes-bundle.building-first');
  const second = join(ctx.directory, 'notes-bundle.building-second');
  const target = join(ctx.directory, 'notes-bundle');

  await mkdir(first);
  await mkdir(second);
  await writeFile(join(first, 'bundle.js'), 'first\n');
  await writeFile(join(second, 'bundle.js'), 'second\n');

  const isFirstMoved = await templateFiles.moveDirectory(first, target);
  const isSecondMoved = await templateFiles.moveDirectory(second, target);
  const bundle = await templateFiles.readFile(join(target, 'bundle.js'));

  expect(isFirstMoved).toBeTrue();
  expect(isSecondMoved).toBeFalse();
  expect(new TextDecoder().decode(bundle)).toBe('first\n');
});

test('it removes a folder with its files, and a path that does not exist', async () => {
  const ctx = await setupTest();

  const folder = join(ctx.directory, 'notes-bundle');

  await templateFiles.createDirectories(join(folder, 'dist'));
  await templateFiles.writeFile(join(folder, 'dist', 'bundle.js'), 'built\n');
  await templateFiles.removePath(folder);
  await templateFiles.removePath(join(ctx.directory, 'missing'));

  const entries = await readdir(ctx.directory);

  expect(entries).toStrictEqual([]);
});

test('it fails to move a folder that does not exist', async () => {
  const ctx = await setupTest();

  expect(
    templateFiles.moveDirectory(
      join(ctx.directory, 'missing'),
      join(ctx.directory, 'notes-bundle'),
    ),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});
