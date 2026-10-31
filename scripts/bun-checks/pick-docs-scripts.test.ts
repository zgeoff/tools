import { expect, test } from 'bun:test';
import { pickDocsScripts } from './pick-docs-scripts.ts';

test('it picks the three docs scripts when neither optional check is present', () => {
  expect(pickDocsScripts({ vision: false, skill: false })).toStrictEqual([
    '.claude/skills/docs-writing/scripts/check-prose.sh',
    '.claude/skills/docs-writing/scripts/check-length.sh',
    '.claude/skills/docs-writing/scripts/check-links.sh',
  ]);
});

test('it adds the vision check and then the skill check when each is present', () => {
  expect(pickDocsScripts({ vision: true, skill: true }).slice(3)).toStrictEqual([
    '.claude/skills/docs-writing/scripts/check-vision.sh',
    '.claude/skills/skill-writing/scripts/check-skill.sh',
  ]);
});

test('it adds the skill check alone when the vision check is absent', () => {
  expect(pickDocsScripts({ vision: false, skill: true }).slice(3)).toStrictEqual([
    '.claude/skills/skill-writing/scripts/check-skill.sh',
  ]);
});
