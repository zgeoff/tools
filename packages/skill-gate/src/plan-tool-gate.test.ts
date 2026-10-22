import { expect, test } from 'bun:test';
import { planToolGate } from './plan-tool-gate.ts';

test('it lists the skills and references the gates on a tool need that the session lacks', () => {
  expect(
    planToolGate({
      tools: [
        {
          tool: 'mcp__tracker__update_ticket',
          skills: ['ticket-review', 'tracker'],
          references: ['ticket-review/references/reasons.md'],
        },
        { tool: 'mcp__tracker__update_ticket', skills: ['tracker'], references: [] },
        { tool: 'mcp__tracker__close_ticket', skills: ['closing'], references: [] },
      ],
      toolName: 'mcp__tracker__update_ticket',
      skillsDir: '/repo/.claude/skills',
      loads: { skills: ['ticket-review'], readPaths: [], compacted: false },
      availableSkills: ['ticket-review', 'tracker', 'closing'],
      availableReferences: ['ticket-review/references/reasons.md'],
    }),
  ).toStrictEqual({
    missingSkills: ['tracker'],
    missingReferences: ['ticket-review/references/reasons.md'],
    unknown: [],
  });
});

test('it counts a reference once the session reads its file under the skills folder', () => {
  expect(
    planToolGate({
      tools: [
        {
          tool: 'mcp__tracker__update_ticket',
          skills: [],
          references: ['ticket-review/references/reasons.md'],
        },
      ],
      toolName: 'mcp__tracker__update_ticket',
      skillsDir: '/repo/.claude/skills',
      loads: {
        skills: [],
        readPaths: ['/repo/.claude/skills/ticket-review/./references/reasons.md'],
        compacted: false,
      },
      availableSkills: [],
      availableReferences: ['ticket-review/references/reasons.md'],
    }),
  ).toStrictEqual({ missingSkills: [], missingReferences: [], unknown: [] });
});

test('it never counts a read of a file with the same name in another folder', () => {
  expect(
    planToolGate({
      tools: [
        {
          tool: 'mcp__tracker__update_ticket',
          skills: [],
          references: ['ticket-review/references/reasons.md'],
        },
      ],
      toolName: 'mcp__tracker__update_ticket',
      skillsDir: '/repo/.claude/skills',
      loads: {
        skills: [],
        readPaths: ['/elsewhere/ticket-review/references/reasons.md'],
        compacted: false,
      },
      availableSkills: [],
      availableReferences: ['ticket-review/references/reasons.md'],
    }),
  ).toStrictEqual({
    missingSkills: [],
    missingReferences: ['ticket-review/references/reasons.md'],
    unknown: [],
  });
});

test('it reports a skill or reference the repo lacks and never requires it', () => {
  expect(
    planToolGate({
      tools: [
        {
          tool: 'mcp__tracker__update_ticket',
          skills: ['ticket-review', 'retired'],
          references: ['ticket-review/references/gone.md'],
        },
      ],
      toolName: 'mcp__tracker__update_ticket',
      skillsDir: '/repo/.claude/skills',
      loads: { skills: [], readPaths: [], compacted: false },
      availableSkills: ['ticket-review'],
      availableReferences: [],
    }),
  ).toStrictEqual({
    missingSkills: ['ticket-review'],
    missingReferences: [],
    unknown: [
      { tool: 'mcp__tracker__update_ticket', kind: 'skill', name: 'retired' },
      {
        tool: 'mcp__tracker__update_ticket',
        kind: 'reference',
        name: 'ticket-review/references/gone.md',
      },
    ],
  });
});
