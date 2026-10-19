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
