import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeFileSystem } from '../scripts/ci/node-file-system.ts';
import { readPinnedSkillText } from './read-pinned-skill-text.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const root = await mkdtemp(join(import.meta.dir, '.test-read-pinned-skill-text-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root };
}

test('it reads the file from the tree of the pinned commit', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.root, {
    'sync/skills-pin.json': JSON.stringify({ commit: '0123456789abcdef0123456789abcdef01234567' }),
    '.zgeoff-skills/0123456789abcdef0123456789abcdef01234567/skills/kettle/SKILL.md': '# Kettle\n',
    '.zgeoff-skills/89abcdef0123456789abcdef0123456789abcdef/skills/kettle/SKILL.md': '# Stale\n',
  });

  const text = await readPinnedSkillText(nodeFileSystem, ctx.root, 'skills/kettle/SKILL.md');

  expect(text).toBe('# Kettle\n');
});

test('it names the install command when the pinned tree is missing', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.root, {
    'sync/skills-pin.json': JSON.stringify({ commit: '0123456789abcdef0123456789abcdef01234567' }),
  });

  const read = readPinnedSkillText(nodeFileSystem, ctx.root, 'skills/kettle/SKILL.md');

  expect(read).rejects.toThrow(
    `${join(ctx.root, '.zgeoff-skills/0123456789abcdef0123456789abcdef01234567/skills/kettle/SKILL.md')} is missing; run bun run skills:install to unpack zgeoff/skills at 0123456789abcdef0123456789abcdef01234567`,
  );
});

test('it refuses a pin that holds no full commit ID', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.root, { 'sync/skills-pin.json': JSON.stringify({ commit: 'main' }) });

  expect(readPinnedSkillText(nodeFileSystem, ctx.root, 'skills/kettle/SKILL.md')).rejects.toThrow(
    'sync/skills-pin.json holds no full commit ID of zgeoff/skills',
  );
});
