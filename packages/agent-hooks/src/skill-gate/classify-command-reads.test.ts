import { expect, test } from 'bun:test';
import { classifyCommandReads } from './classify-command-reads.ts';

test('it takes a SKILL.md under either skills folder as a loaded skill', () => {
  expect(
    classifyCommandReads(
      [
        '/repo/.agents/skills/testing/SKILL.md',
        '/repo/.claude/skills/docs-writing/SKILL.md',
        '/repo/.agents/skills/testing/references/x.md',
        '/elsewhere/.agents/skills/other/SKILL.md',
      ],
      '/repo',
      [],
    ),
  ).toStrictEqual({ skills: ['testing', 'docs-writing'], readPaths: [] });
});

test('it records a reference read through .agents/skills as the .claude/skills path', () => {
  expect(
    classifyCommandReads(['/repo/.agents/skills/ticket/references/a.md'], '/repo', [
      'ticket/references/a.md',
      'ticket/references/b.md',
    ]),
  ).toStrictEqual({ skills: [], readPaths: ['/repo/.claude/skills/ticket/references/a.md'] });
});
