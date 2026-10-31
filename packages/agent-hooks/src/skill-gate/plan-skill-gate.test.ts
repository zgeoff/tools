import { expect, test } from 'bun:test';
import { planSkillGate } from './plan-skill-gate.ts';

test('it lists the skills a matching gate needs that the session has not loaded', () => {
  expect(
    planSkillGate({
      rules: {
        ignore: [],
        gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }],
      },
      relativePath: 'src/parse/parse-entry.test.ts',
      loadedSkills: ['testing'],
      availableSkills: ['testing', 'project-testing'],
    }),
  ).toStrictEqual({ missing: ['project-testing'], unknown: [] });
});

test('it matches a file at the project root against a recursive glob', () => {
  expect(
    planSkillGate({
      rules: { ignore: [], gates: [{ match: '**/*.test.ts', skills: ['testing'] }] },
      relativePath: 'cli.test.ts',
      loadedSkills: [],
      availableSkills: ['testing'],
    }),
  ).toStrictEqual({ missing: ['testing'], unknown: [] });
});

test('it merges the skills of every matching gate in gate order without repeats', () => {
  expect(
    planSkillGate({
      rules: {
        ignore: [],
        gates: [
          { match: '**/*.{ts,tsx}', skills: ['code-style'] },
          { match: '**/*.test.{ts,tsx}', skills: ['testing', 'project-testing'] },
          { match: 'services/activity/**', skills: ['game-lifecycle', 'code-style'] },
        ],
      },
      relativePath: 'services/activity/src/a.test.tsx',
      loadedSkills: [],
      availableSkills: ['code-style', 'testing', 'project-testing', 'game-lifecycle'],
    }),
  ).toStrictEqual({
    missing: ['code-style', 'testing', 'project-testing', 'game-lifecycle'],
    unknown: [],
  });
});

test('it allows an edit once the session has loaded every skill the path needs', () => {
  expect(
    planSkillGate({
      rules: {
        ignore: [],
        gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }],
      },
      relativePath: 'src/a.test.ts',
      loadedSkills: ['testing', 'project-testing'],
      availableSkills: ['testing', 'project-testing'],
    }),
  ).toStrictEqual({ missing: [], unknown: [] });
});

test('it allows a path that no gate matches', () => {
  expect(
    planSkillGate({
      rules: { ignore: [], gates: [{ match: '**/*.md', skills: ['docs-writing'] }] },
      relativePath: 'package.json',
      loadedSkills: [],
      availableSkills: ['docs-writing'],
    }),
  ).toStrictEqual({ missing: [], unknown: [] });
});

test('it allows a path that holds an ignore segment', () => {
  expect(
    planSkillGate({
      rules: {
        ignore: ['node_modules/', '.generated.'],
        gates: [{ match: '**/*.ts', skills: ['code-style'] }],
      },
      relativePath: 'libs/api/src/routes.generated.ts',
      loadedSkills: [],
      availableSkills: ['code-style'],
    }),
  ).toStrictEqual({ missing: [], unknown: [] });
});

test('it reports a rule that names a skill the repo does not have and never requires it', () => {
  expect(
    planSkillGate({
      rules: {
        ignore: [],
        gates: [
          { match: '**/*.test.ts', skills: ['testing', 'project-testing'] },
          { match: '**/*.md', skills: ['docs-writing'] },
        ],
      },
      relativePath: 'src/a.test.ts',
      loadedSkills: [],
      availableSkills: ['testing'],
    }),
  ).toStrictEqual({
    missing: ['testing'],
    unknown: [
      { match: '**/*.test.ts', skill: 'project-testing' },
      { match: '**/*.md', skill: 'docs-writing' },
    ],
  });
});
