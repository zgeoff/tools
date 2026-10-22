import { expect, test } from 'bun:test';
import { buildToolGateOutput } from './build-tool-gate-output.ts';

test('it denies the call and names each missing skill and reference', () => {
  expect(
    buildToolGateOutput('mcp__tracker__update_ticket', {
      missingSkills: ['ticket-review'],
      missingReferences: ['ticket-review/references/reasons.md', 'tracker/references/fields.md'],
      unknown: [],
    }),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Before calling mcp__tracker__update_ticket, load the `ticket-review` skill with the Skill tool and read .claude/skills/ticket-review/references/reasons.md and .claude/skills/tracker/references/fields.md with the Read tool, then retry the call. .claude/skill-gate.json lists the skills and references each tool needs.',
    },
  });
});

test('it tells the session to read the references again after a compaction', () => {
  expect(
    buildToolGateOutput(
      'mcp__tracker__update_ticket',
      {
        missingSkills: [],
        missingReferences: ['ticket-review/references/reasons.md'],
        unknown: [],
      },
      { compacted: true },
    ),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Before calling mcp__tracker__update_ticket, read .claude/skills/ticket-review/references/reasons.md again with the Read tool, then retry the call. This session was compacted, and a skill or reference loaded before the compaction no longer counts. .claude/skill-gate.json lists the skills and references each tool needs.',
    },
  });
});

test('it stays silent when nothing is missing', () => {
  expect(
    buildToolGateOutput('mcp__tracker__update_ticket', {
      missingSkills: [],
      missingReferences: [],
      unknown: [],
    }),
  ).toBeNull();
});

test('it warns and allows the call for a reference the repo lacks or a key it does not know', () => {
  const warning = [
    'skill-gate: .claude/skill-gate.json holds the key `commands`, which this version of @zgeoff/skill-gate does not know. The gate skips the key and keeps the rest of the rules; update the package or remove the key.',
    'skill-gate: the tool gate "mcp__tracker__update_ticket" in .claude/skill-gate.json names the reference "ticket-review/references/gone.md", but .claude/skills/ticket-review/references/gone.md does not exist. Fix the rule or add the file; until then the gate skips that reference.',
  ].join('\n');

  expect(
    buildToolGateOutput(
      'mcp__tracker__update_ticket',
      {
        missingSkills: [],
        missingReferences: [],
        unknown: [
          {
            tool: 'mcp__tracker__update_ticket',
            kind: 'reference',
            name: 'ticket-review/references/gone.md',
          },
        ],
      },
      { unknownKeys: ['commands'] },
    ),
  ).toStrictEqual({
    systemMessage: warning,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warning },
  });
});
