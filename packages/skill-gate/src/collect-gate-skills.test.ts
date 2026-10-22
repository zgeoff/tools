import { expect, test } from 'bun:test';
import { collectGateSkills } from './collect-gate-skills.ts';

test('it collects the skills of every gate that matches the path in gate order', () => {
  expect(
    collectGateSkills(
      {
        ignore: [],
        gates: [
          { match: '**/*.ts', skills: ['code-style'] },
          { match: '**/*.md', skills: ['docs-writing'] },
          { match: '**/*.test.ts', skills: ['testing', 'code-style'] },
        ],
      },
      'src/a.test.ts',
    ),
  ).toStrictEqual(['code-style', 'testing', 'code-style']);
});

test('it collects no skill for a path that holds an ignore segment', () => {
  expect(
    collectGateSkills(
      { ignore: ['dist/'], gates: [{ match: '**/*.ts', skills: ['code-style'] }] },
      'dist/a.ts',
    ),
  ).toStrictEqual([]);
});

test('it matches a path inside a dot folder', () => {
  expect(
    collectGateSkills(
      { ignore: [], gates: [{ match: '**/*.md', skills: ['docs-writing'] }] },
      '.claude/skills/testing/SKILL.md',
    ),
  ).toStrictEqual(['docs-writing']);
});

test('it matches a deep path under a brace group of two globstar patterns', () => {
  expect(
    collectGateSkills(
      { ignore: [], gates: [{ match: '{e2e/**,test/**}', skills: ['testing'] }] },
      'test/journeys/sign-in.ts',
    ),
  ).toStrictEqual(['testing']);
});
