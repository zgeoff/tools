import { expect, test } from 'bun:test';
import { buildSkillFilesManifest } from './build-skill-files-manifest.ts';

test('it adds a new file of a shipped skill folder after the files that sort before it', () => {
  const manifest = [
    {
      name: 'skill-kettle',
      description: 'The kettle skill',
      files: [
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/SKILL.md',
          target: '.claude/skills/kettle/SKILL.md',
        },
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/references/limescale.md',
          target: '.claude/skills/kettle/references/limescale.md',
        },
        {
          source: 'packages/kettle/check-kettle.sh',
          target: '.claude/skills/kettle/scripts/check-kettle.sh',
        },
      ],
    },
  ];

  const result = buildSkillFilesManifest(manifest, [
    { path: 'skills/kettle/SKILL.md', mode: '100644' },
    { path: 'skills/kettle/references/descaling.md', mode: '100644' },
    { path: 'skills/kettle/references/limescale.md', mode: '100644' },
    { path: 'skills/kettle/references/whistle.md', mode: '100644' },
  ]);

  expect(result).toStrictEqual({
    manifest: [
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/references/descaling.md',
            target: '.claude/skills/kettle/references/descaling.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/references/limescale.md',
            target: '.claude/skills/kettle/references/limescale.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/references/whistle.md',
            target: '.claude/skills/kettle/references/whistle.md',
          },
          {
            source: 'packages/kettle/check-kettle.sh',
            target: '.claude/skills/kettle/scripts/check-kettle.sh',
          },
        ],
      },
    ],
    added: ['skills/kettle/references/descaling.md', 'skills/kettle/references/whistle.md'],
  });
});

test('it adds no file of a skill folder that no entry ships', () => {
  const manifest = [
    {
      name: 'skill-kettle',
      files: [
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/SKILL.md',
          target: '.claude/skills/kettle/SKILL.md',
        },
      ],
    },
  ];

  const result = buildSkillFilesManifest(manifest, [
    { path: 'skills/kettle/SKILL.md', mode: '100644' },
    { path: 'skills/teapot/SKILL.md', mode: '100644' },
    { path: 'skills/teapot/references/brewing.md', mode: '100644' },
  ]);

  expect(result).toStrictEqual({ manifest, added: [] });
});

test('it adds no test file of a shipped skill folder', () => {
  const manifest = [
    {
      name: 'skill-kettle',
      files: [
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/SKILL.md',
          target: '.claude/skills/kettle/SKILL.md',
        },
      ],
    },
  ];

  const result = buildSkillFilesManifest(manifest, [
    { path: 'skills/kettle/SKILL.md', mode: '100644' },
    { path: 'skills/kettle/scripts/boil.test.ts', mode: '100644' },
  ]);

  expect(result).toStrictEqual({ manifest, added: [] });
});

test('it adds the new file to each entry that ships the skill folder', () => {
  const manifest = [
    {
      name: 'skill-kettle',
      files: [
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/SKILL.md',
          target: '.claude/skills/kettle/SKILL.md',
        },
      ],
    },
    {
      name: 'agents-kettle',
      files: [
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/SKILL.md',
          target: '.agents/skills/kettle/SKILL.md',
        },
      ],
    },
  ];

  const result = buildSkillFilesManifest(manifest, [
    { path: 'skills/kettle/SKILL.md', mode: '100644' },
    { path: 'skills/kettle/references/descaling.md', mode: '100644' },
  ]);

  expect(result).toStrictEqual({
    manifest: [
      {
        name: 'skill-kettle',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/references/descaling.md',
            target: '.claude/skills/kettle/references/descaling.md',
          },
        ],
      },
      {
        name: 'agents-kettle',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.agents/skills/kettle/SKILL.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/references/descaling.md',
            target: '.agents/skills/kettle/references/descaling.md',
          },
        ],
      },
    ],
    added: ['skills/kettle/references/descaling.md'],
  });
});

test('it gives a new executable file the executable mode and leaves out a link', () => {
  const manifest = [
    {
      name: 'skill-kettle',
      files: [
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/SKILL.md',
          target: '.claude/skills/kettle/SKILL.md',
        },
      ],
    },
  ];

  const result = buildSkillFilesManifest(manifest, [
    { path: 'skills/kettle/SKILL.md', mode: '100644' },
    { path: 'skills/kettle/scripts/boil.sh', mode: '100755' },
    { path: 'skills/kettle/scripts/steam.sh', mode: '120000' },
  ]);

  expect(result).toStrictEqual({
    manifest: [
      {
        name: 'skill-kettle',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/scripts/boil.sh',
            target: '.claude/skills/kettle/scripts/boil.sh',
            mode: '0755',
          },
        ],
      },
    ],
    added: ['skills/kettle/scripts/boil.sh'],
  });
});
