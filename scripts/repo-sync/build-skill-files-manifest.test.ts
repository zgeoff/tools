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
    'skills/kettle/SKILL.md',
    'skills/kettle/references/descaling.md',
    'skills/kettle/references/limescale.md',
    'skills/kettle/references/whistle.md',
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
    'skills/kettle/SKILL.md',
    'skills/teapot/SKILL.md',
    'skills/teapot/references/brewing.md',
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
    'skills/kettle/SKILL.md',
    'skills/kettle/scripts/boil.test.ts',
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
    'skills/kettle/SKILL.md',
    'skills/kettle/references/descaling.md',
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
