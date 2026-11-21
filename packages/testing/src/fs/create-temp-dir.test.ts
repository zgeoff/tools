import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { createTempDir } from './create-temp-dir.ts';
import { readRunFolderPrefix } from './read-run-folder-prefix.ts';

test('it makes a folder under the OS temp folder, named with the run folder prefix', () => {
  const folder = createTempDir('stub-gh');

  expect({
    parent: dirname(folder.path),
    isFolder: statSync(folder.path).isDirectory(),
  }).toStrictEqual({
    parent: tmpdir(),
    isFolder: true,
  });

  expect(folder.path.slice(tmpdir().length + 1)).toStartWith(readRunFolderPrefix('stub-gh'));
});

test('it makes a different folder on each call with the same name', () => {
  const first = createTempDir('stub-gh');
  const second = createTempDir('stub-gh');

  expect(first.path).not.toBe(second.path);
});

test('it removes the folder and what is in it when the test ends', async () => {
  const folder = createTempDir('stub-gh');

  await Bun.write(`${folder.path}/nested/glaze.txt`, 'celadon');

  onTestFinished(() => {
    expect(existsSync(folder.path)).toBeFalse();
  });
});

test('it leaves the folder in place after the test with cleanup manual', () => {
  const folder = createTempDir('stub-gh', { cleanup: 'manual' });

  onTestFinished(() => {
    const isThere = existsSync(folder.path);

    folder.remove();

    expect(isThere).toBeTrue();
  });
});

test('it removes the folder early, and the after-test removal then has nothing to do', () => {
  const folder = createTempDir('stub-gh');

  folder.remove();

  expect(existsSync(folder.path)).toBeFalse();
});
