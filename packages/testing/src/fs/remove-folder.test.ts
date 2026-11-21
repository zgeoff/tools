import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { createTempDir } from './create-temp-dir.ts';
import { removeFolder } from './remove-folder.ts';

test('it removes the folder once when the folder is gone after the first removal', () => {
  const removed: string[] = [];

  removeFolder('/scratch/kiln', {
    exists: () => false,
    removeTree: (path) => {
      removed.push(path);
    },
  });

  expect(removed).toStrictEqual(['/scratch/kiln']);
});

test('it removes the folder again while it is still there', () => {
  const remaining = { removals: 0 };

  removeFolder('/scratch/kiln', {
    exists: () => remaining.removals < 3,
    removeTree: () => {
      remaining.removals += 1;
    },
  });

  expect(remaining.removals).toBe(3);
});

test('it throws after 10 removals that leave the folder in place', () => {
  const remaining = { removals: 0 };

  expect(() => {
    removeFolder('/scratch/kiln', {
      exists: () => true,
      removeTree: () => {
        remaining.removals += 1;
      },
    });
  }).toThrow('/scratch/kiln was still there after 10 removals');

  expect(remaining.removals).toBe(10);
});

test('it removes a real folder with its files', async () => {
  const folder = createTempDir('remove-folder');

  await Bun.write(`${folder.path}/nested/glaze.txt`, 'celadon');

  removeFolder(folder.path);

  expect(existsSync(folder.path)).toBeFalse();
});
