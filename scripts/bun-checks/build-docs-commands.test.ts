import { expect, test } from 'bun:test';
import { buildDocsCommands } from './build-docs-commands.ts';

test('it names the READMEs and the other docs to the prose check, and runs the length and links checks bare', () => {
  expect(buildDocsCommands({ vision: false, skill: false, readmes: ['README.md'] })).toStrictEqual([
    {
      script: '.claude/skills/docs-writing/scripts/check-prose.sh',
      args: [
        'README.md',
        ':(glob)docs/**/*.md',
        ':(glob)**/results.md',
        ':(glob).agents/skills/**/*.md',
        ':(glob).claude/skills/**/*.md',
        ':(glob)skills/**/*.md',
        ':(glob)sync/skills/**/*.md',
      ],
    },
    { script: '.claude/skills/docs-writing/scripts/check-length.sh', args: [] },
    { script: '.claude/skills/docs-writing/scripts/check-links.sh', args: [] },
  ]);
});

test('it adds the vision check and then the skill check when each is present', () => {
  expect(buildDocsCommands({ vision: true, skill: true, readmes: [] }).slice(3)).toStrictEqual([
    { script: '.claude/skills/docs-writing/scripts/check-vision.sh', args: [] },
    { script: '.claude/skills/skill-writing/scripts/check-skill.sh', args: [] },
  ]);
});

test('it adds the skill check alone when the vision check is absent', () => {
  expect(buildDocsCommands({ vision: false, skill: true, readmes: [] }).slice(3)).toStrictEqual([
    { script: '.claude/skills/skill-writing/scripts/check-skill.sh', args: [] },
  ]);
});
