import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { writeSkillsArchive } from './write-skills-archive.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'write-skills-archive-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it packs every file under one skills-<commit> top folder', async () => {
  const ctx = await setupTest();

  const commit = '0123456789abcdef0123456789abcdef01234567';
  const archivePath = join(ctx.directory, 'archive.tar.gz');

  await writeSkillsArchive({
    packDirectory: join(ctx.directory, 'pack'),
    archivePath,
    commit,
    files: {
      'skills/watering/SKILL.md': '# Watering\n',
      'README.md': '# Garden skills\n',
    },
  });

  const listed = await $`tar -tzf ${archivePath}`.text();

  const files = listed
    .split('\n')
    .filter((line) => line !== '' && !line.endsWith('/'))
    .toSorted();

  const unpacked = join(ctx.directory, 'unpacked');

  await mkdir(unpacked);

  await $`tar -xzf ${archivePath} -C ${unpacked}`.quiet();

  const skill = await readFile(
    join(unpacked, `skills-${commit}`, 'skills/watering/SKILL.md'),
    'utf8',
  );

  expect(files).toStrictEqual([
    `skills-${commit}/README.md`,
    `skills-${commit}/skills/watering/SKILL.md`,
  ]);

  expect(skill).toBe('# Watering\n');
});
