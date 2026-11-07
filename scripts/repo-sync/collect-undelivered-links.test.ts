import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildMockSyncEntry } from '../test-utils/build-mock-sync-entry.ts';
import { collectUndeliveredLinks, readUndeliveredLinks } from './collect-undelivered-links.ts';
import { parseSkillsPin } from './parse-skills-pin.ts';

test('it reports a link from an entry every repo takes to an opt-in entry it does not need', () => {
  const links = collectUndeliveredLinks(
    [
      buildMockSyncEntry({
        name: 'skill-kettle',
        files: [
          { repo: 'zgeoff/skills', source: 'skills/kettle/SKILL.md', target: 'kettle/SKILL.md' },
        ],
      }),
      buildMockSyncEntry({
        name: 'skill-descaling',
        optIn: true,
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/descaling/SKILL.md',
            target: 'descaling/SKILL.md',
          },
        ],
      }),
    ],
    new Map([['kettle/SKILL.md', 'Read [descaling](../descaling/SKILL.md#steps) first.\n']]),
  );

  expect(links).toStrictEqual([
    {
      entry: 'skill-kettle',
      source: 'skills/kettle/SKILL.md',
      link: '../descaling/SKILL.md',
      owners: ['skill-descaling'],
    },
  ]);
});

test('it reports a link from an opt-in entry to another opt-in entry it does not need', () => {
  const links = collectUndeliveredLinks(
    [
      buildMockSyncEntry({
        name: 'skill-kettle',
        optIn: true,
        files: [
          { repo: 'zgeoff/skills', source: 'skills/kettle/SKILL.md', target: 'kettle/SKILL.md' },
        ],
      }),
      buildMockSyncEntry({
        name: 'skill-descaling',
        optIn: true,
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/descaling/SKILL.md',
            target: 'descaling/SKILL.md',
          },
        ],
      }),
    ],
    new Map([['kettle/SKILL.md', 'Read [descaling](../descaling/SKILL.md) first.\n']]),
  );

  expect(links).toStrictEqual([
    {
      entry: 'skill-kettle',
      source: 'skills/kettle/SKILL.md',
      link: '../descaling/SKILL.md',
      owners: ['skill-descaling'],
    },
  ]);
});

test('it passes a link to an entry that a needed entry needs in turn', () => {
  const links = collectUndeliveredLinks(
    [
      buildMockSyncEntry({
        name: 'skill-kettle',
        needs: ['skill-descaling'],
        files: [
          { repo: 'zgeoff/skills', source: 'skills/kettle/SKILL.md', target: 'kettle/SKILL.md' },
        ],
      }),
      buildMockSyncEntry({
        name: 'skill-descaling',
        optIn: true,
        needs: ['skill-limescale'],
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/descaling/SKILL.md',
            target: 'descaling/SKILL.md',
          },
        ],
      }),
      buildMockSyncEntry({
        name: 'skill-limescale',
        optIn: true,
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/limescale/SKILL.md',
            target: 'limescale/SKILL.md',
          },
        ],
      }),
    ],
    new Map([['kettle/SKILL.md', 'Read [limescale](../limescale/SKILL.md) first.\n']]),
  );

  expect(links).toStrictEqual([]);
});

test('it passes a link from an opt-in entry to an entry every repo takes', () => {
  const links = collectUndeliveredLinks(
    [
      buildMockSyncEntry({
        name: 'skill-kettle',
        optIn: true,
        files: [
          { repo: 'zgeoff/skills', source: 'skills/kettle/SKILL.md', target: 'kettle/SKILL.md' },
        ],
      }),
      buildMockSyncEntry({
        name: 'skill-teapot',
        files: [
          { repo: 'zgeoff/skills', source: 'skills/teapot/SKILL.md', target: 'teapot/SKILL.md' },
        ],
      }),
    ],
    new Map([['kettle/SKILL.md', 'Pour as [teapot](../teapot/SKILL.md) says.\n']]),
  );

  expect(links).toStrictEqual([]);
});

test('it passes a link to no delivered file, an absolute path and a URL', () => {
  const links = collectUndeliveredLinks(
    [
      buildMockSyncEntry({
        name: 'skill-kettle',
        files: [
          { repo: 'zgeoff/skills', source: 'skills/kettle/SKILL.md', target: 'kettle/SKILL.md' },
        ],
      }),
      buildMockSyncEntry({
        name: 'skill-descaling',
        optIn: true,
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/descaling/SKILL.md',
            target: 'descaling/SKILL.md',
          },
        ],
      }),
    ],
    new Map([
      [
        'kettle/SKILL.md',
        '[Spout](../spout/SKILL.md), [root](/descaling/SKILL.md), [site](https://example.com/descaling/SKILL.md)\n',
      ],
    ]),
  );

  expect(links).toStrictEqual([]);
});

test('it finds no undelivered link in the sync manifest at the pinned zgeoff/skills commit', async () => {
  const root = join(import.meta.dir, '../..');

  const pinValue: unknown = await Bun.file(join(root, 'sync/skills-pin.json')).json();

  const skillsTree = join(root, '.zgeoff-skills', parseSkillsPin(pinValue) ?? '');

  invariant(existsSync(skillsTree), `run bun run skills:install to unpack ${skillsTree}`);

  const links = readUndeliveredLinks(join(root, 'sync/manifest.json'), root, skillsTree);

  expect(links).toStrictEqual([]);
});
