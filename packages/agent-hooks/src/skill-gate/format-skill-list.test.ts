import { expect, test } from 'bun:test';
import { formatSkillList } from './format-skill-list.ts';

test.each([
  [['testing'], '`testing` skill'],
  [['testing', 'project-testing'], '`testing` and `project-testing` skills'],
  [
    ['code-style', 'testing', 'project-testing'],
    '`code-style`, `testing` and `project-testing` skills',
  ],
])('it formats %j as %j', (skills, expected) => {
  expect(formatSkillList(skills)).toBe(expected);
});
