import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readRunFolderPrefix, writeTreeFiles } from '@zgeoff/testing/helpers';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { readUndeliveredLinks } from './read-undelivered-links.ts';

async function setupTest() {
  const directory = await mkdtemp(
    join(import.meta.dir, readRunFolderPrefix('.test-read-undelivered-links-')),
  );

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    readLinks: () =>
      readUndeliveredLinks(nodeFileSystem, {
        manifest: join(directory, 'tools/sync/manifest.json'),
        toolsRoot: join(directory, 'tools'),
        skillsTree: join(directory, 'skills'),
      }),
  };
}

test('it reads the Markdown sources of both repos and returns their undelivered links', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'tools/docs/kettle.md': 'Descale as [descaling](./skills/descaling/SKILL.md) says.\n',
    'skills/skills/teapot/SKILL.md': 'Descale as [descaling](../descaling/SKILL.md) says.\n',
    'skills/skills/descaling/SKILL.md': '# Descaling\n',
    'tools/sync/manifest.json': JSON.stringify([
      {
        name: 'doc-kettle',
        description: 'The kettle doc',
        files: [{ source: 'docs/kettle.md', target: '.claude/kettle.md' }],
      },
      {
        name: 'skill-teapot',
        description: 'The teapot skill',
        optIn: true,
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/teapot/SKILL.md',
            target: '.claude/skills/teapot/SKILL.md',
          },
        ],
      },
      {
        name: 'skill-descaling',
        description: 'The descaling skill',
        optIn: true,
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/descaling/SKILL.md',
            target: '.claude/skills/descaling/SKILL.md',
          },
        ],
      },
    ]),
  });

  const read = await ctx.readLinks();

  expect(read).toStrictEqual({
    kind: 'read',
    links: [
      {
        entry: 'doc-kettle',
        source: 'docs/kettle.md',
        link: './skills/descaling/SKILL.md',
        owners: ['skill-descaling'],
      },
      {
        entry: 'skill-teapot',
        source: 'skills/teapot/SKILL.md',
        link: '../descaling/SKILL.md',
        owners: ['skill-descaling'],
      },
    ],
  });
});

test('it returns unparsed for a manifest whose entry has no description', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'tools/sync/manifest.json': JSON.stringify([{ name: 'doc-kettle', files: [] }]),
  });

  const read = await ctx.readLinks();

  expect(read).toStrictEqual({ kind: 'unparsed' });
});
