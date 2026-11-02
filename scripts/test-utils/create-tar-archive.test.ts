import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { createTarArchive } from './create-tar-archive.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-create-tar-archive-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it packs each file with its content and mode, and leaves no folder behind', async () => {
  const ctx = await setupTest();

  const bytes = await createTarArchive(ctx.directory, {
    kettle: { content: 'boil\n', mode: 0o755 },
    'README.md': { content: 'steam\n', mode: 0o644 },
  });

  const left = await readdir(ctx.directory);

  const unpacked = join(ctx.directory, 'unpacked');

  await mkdir(unpacked);
  await writeFile(join(ctx.directory, 'release.tar.gz'), bytes);

  await $`tar -xzf ${join(ctx.directory, 'release.tar.gz')} -C ${unpacked}`.quiet();

  const names = await readdir(unpacked);
  const kettle = await readFile(join(unpacked, 'kettle'), 'utf8');
  const readme = await readFile(join(unpacked, 'README.md'), 'utf8');
  const kettleStats = await stat(join(unpacked, 'kettle'));
  const readmeStats = await stat(join(unpacked, 'README.md'));

  expect(left).toStrictEqual([]);
  expect(names.toSorted()).toStrictEqual(['README.md', 'kettle']);
  expect(kettle).toBe('boil\n');
  expect(readme).toBe('steam\n');
  expect(kettleStats.mode & 0o777).toBe(0o755);
  expect(readmeStats.mode & 0o777).toBe(0o644);
});
