import { expect, test } from 'bun:test';
import { buildMockSyncEntry } from '../test-utils/build-mock-sync-entry.ts';
import { collectUndeliveredLinks } from './collect-undelivered-links.ts';

test.each([
  [
    'an inline link with a fragment',
    'Read [descaling](../descaling/SKILL.md#steps) first.\n',
    '../descaling/SKILL.md',
  ],
  [
    'a link in angle brackets',
    'Read [descaling](<../descaling/SKILL.md>) first.\n',
    '../descaling/SKILL.md',
  ],
  [
    'a reference-style link',
    'Read [descaling][d] first.\n\n[d]: ../descaling/SKILL.md\n',
    '../descaling/SKILL.md',
  ],
  ['a link to the folder', 'Read [descaling](../descaling/) first.\n', '../descaling/'],
  [
    'a link from the repo root',
    'Read [descaling](/descaling/SKILL.md) first.\n',
    '/descaling/SKILL.md',
  ],
])(
  'it reports %s from an entry every repo takes to an opt-in entry it does not need',
  (_label, markdown, link) => {
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
      new Map([['kettle/SKILL.md', markdown]]),
    );

    expect(links).toStrictEqual([
      {
        entry: 'skill-kettle',
        source: 'skills/kettle/SKILL.md',
        link,
        owners: ['skill-descaling'],
      },
    ]);
  },
);

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

test('it passes a link to a path no entry delivers, and a URL', () => {
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
        '[Spout](../spout/SKILL.md) and [site](https://example.com/descaling/SKILL.md)\n',
      ],
    ]),
  );

  expect(links).toStrictEqual([]);
});
