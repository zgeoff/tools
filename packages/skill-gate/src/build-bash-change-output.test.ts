import { expect, test } from 'bun:test';
import { buildBashChangeOutput } from './build-bash-change-output.ts';

test('it blocks after a command that changed a gated path and names the missing skill', () => {
  expect(buildBashChangeOutput('PostToolUse', ['/repo/src/a.test.ts'], ['testing'])).toStrictEqual({
    decision: 'block',
    reason:
      'skill-gate: this Bash command changed the gated path /repo/src/a.test.ts before the session loaded the skills it needs. Load the `testing` skill with the Skill tool, then review what the command changed against it and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
  });
});

test('it names every changed path and every missing skill', () => {
  expect(
    buildBashChangeOutput(
      'PostToolUse',
      ['/repo/src/a.test.ts', '/repo/README.md'],
      ['testing', 'docs-writing'],
    ),
  ).toStrictEqual({
    decision: 'block',
    reason:
      'skill-gate: this Bash command changed the gated paths /repo/src/a.test.ts, /repo/README.md before the session loaded the skills it needs. Load the `testing` and `docs-writing` skills with the Skill tool, then review what the command changed against them and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
  });
});

test('it says to load the skills again after a compaction', () => {
  expect(
    buildBashChangeOutput('PostToolUse', ['/repo/src/a.test.ts'], ['testing'], {
      compacted: true,
    }),
  ).toStrictEqual({
    decision: 'block',
    reason:
      'skill-gate: this Bash command changed the gated path /repo/src/a.test.ts before the session loaded the skills it needs. Load the `testing` skill again with the Skill tool, then review what the command changed against it and fix what breaks a rule. This session was compacted, and a skill loaded before the compaction no longer counts. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
  });
});

test('it gives the reason as context after a failed command, which a hook cannot block', () => {
  expect(
    buildBashChangeOutput('PostToolUseFailure', ['/repo/src/a.test.ts'], ['testing']),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext:
        'skill-gate: this Bash command changed the gated path /repo/src/a.test.ts before the session loaded the skills it needs. Load the `testing` skill with the Skill tool, then review what the command changed against it and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
    },
  });
});

test('it stays silent when the session has every skill the changed paths need', () => {
  expect(buildBashChangeOutput('PostToolUse', ['/repo/src/a.test.ts'], [])).toBeNull();
});
