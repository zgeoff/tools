import { expect, test } from 'bun:test';
import { planBashSkillGate } from './plan-bash-skill-gate.ts';

test('it lists the gated paths and the skills they need that the session has not loaded', () => {
  expect(
    planBashSkillGate({
      rules: {
        ignore: [],
        gates: [
          { match: '**/*.test.ts', skills: ['testing', 'project-testing'] },
          { match: '**/*.md', skills: ['docs-writing'] },
        ],
      },
      paths: [
        { path: '/repo/src/a.test.ts', relativePath: 'src/a.test.ts' },
        { path: '/repo/notes.txt', relativePath: 'notes.txt' },
        { path: '/repo/README.md', relativePath: 'README.md' },
        { path: '/repo/src/b.test.ts', relativePath: 'src/b.test.ts' },
      ],
      loadedSkills: ['testing'],
      availableSkills: ['testing', 'project-testing', 'docs-writing'],
    }),
  ).toStrictEqual({
    gatedPaths: ['/repo/src/a.test.ts', '/repo/README.md', '/repo/src/b.test.ts'],
    missing: ['project-testing', 'docs-writing'],
  });
});

test('it keeps a gated path when the session has loaded every skill it needs', () => {
  expect(
    planBashSkillGate({
      rules: { ignore: [], gates: [{ match: '**/*.test.ts', skills: ['testing'] }] },
      paths: [{ path: '/repo/src/a.test.ts', relativePath: 'src/a.test.ts' }],
      loadedSkills: ['testing'],
      availableSkills: ['testing'],
    }),
  ).toStrictEqual({ gatedPaths: ['/repo/src/a.test.ts'], missing: [] });
});

test('it gates no path that holds an ignore segment or that no gate matches', () => {
  expect(
    planBashSkillGate({
      rules: { ignore: ['dist/'], gates: [{ match: '**/*.ts', skills: ['code-style'] }] },
      paths: [
        { path: '/repo/dist/a.ts', relativePath: 'dist/a.ts' },
        { path: '/repo/notes.txt', relativePath: 'notes.txt' },
      ],
      loadedSkills: [],
      availableSkills: ['code-style'],
    }),
  ).toStrictEqual({ gatedPaths: [], missing: [] });
});
