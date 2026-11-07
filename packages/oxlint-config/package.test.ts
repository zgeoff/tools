import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { $ } from 'bun';

test('it packs every module that a packed module imports', async () => {
  const pack = await $`bun pm pack --dry-run`.cwd(import.meta.dir).quiet();

  const packed = new Set(
    [...pack.stdout.toString().matchAll(/^packed \S+ (?<path>.+)$/gmu)].map(
      (match) => match.groups?.['path'] ?? '',
    ),
  );

  const imports = await Promise.all(
    [...packed]
      .filter((path) => path.endsWith('.js'))
      .map(async (path) => {
        const text = await readFile(join(import.meta.dir, path), 'utf8');

        return [...text.matchAll(/(?:from |import\()'(?<specifier>\.{1,2}\/[^']+)'/gu)].map(
          (match) => normalize(join(path, '..', match.groups?.['specifier'] ?? '')),
        );
      }),
  );

  expect(imports.flat().filter((path) => !packed.has(path))).toStrictEqual([]);
});
