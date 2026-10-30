import { expect, test } from 'bun:test';
import { buildSkillGateOutput } from './build-skill-gate-output.ts';

test('it denies the edit and names each missing skill and how to load it', () => {
  expect(
    buildSkillGateOutput('/repo/src/a.test.ts', {
      missing: ['testing', 'project-testing'],
      unknown: [],
    }),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Load the `testing` and `project-testing` skills with the Skill tool before editing /repo/src/a.test.ts, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
    },
  });
});

test('it tells the session to load the skills again after a compaction', () => {
  expect(
    buildSkillGateOutput(
      '/repo/src/a.test.ts',
      { missing: ['testing', 'project-testing'], unknown: [] },
      { compacted: true },
    ),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Load the `testing` and `project-testing` skills again with the Skill tool before editing /repo/src/a.test.ts, then retry the edit. This session was compacted, and a skill loaded before the compaction no longer counts. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
    },
  });
});

test('it stays silent after a compaction when no skill is missing', () => {
  expect(
    buildSkillGateOutput('/repo/src/a.ts', { missing: [], unknown: [] }, { compacted: true }),
  ).toBeNull();
});

test('it names a single missing skill in the singular', () => {
  expect(
    buildSkillGateOutput('/repo/README.md', { missing: ['docs-writing'], unknown: [] }),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Load the `docs-writing` skill with the Skill tool before editing /repo/README.md, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
    },
  });
});

test('it lists three missing skills with commas', () => {
  expect(
    buildSkillGateOutput('/repo/src/a.test.tsx', {
      missing: ['code-style', 'testing', 'project-testing'],
      unknown: [],
    })?.hookSpecificOutput.permissionDecisionReason,
  ).toStartWith(
    'Load the `code-style`, `testing` and `project-testing` skills with the Skill tool',
  );
});

test('it stays silent when no skill is missing and every rule is sound', () => {
  expect(buildSkillGateOutput('/repo/src/a.ts', { missing: [], unknown: [] })).toBeNull();
});

test('it warns without a denial when a rule names a skill the repo does not have', () => {
  const warning =
    'skill-gate: the rule "**/*.md" in .claude/skill-gate.json names the skill "docs-writing", but .claude/skills/docs-writing/SKILL.md does not exist. Fix the rule or add the skill; until then the gate skips that skill.';

  expect(
    buildSkillGateOutput('/repo/README.md', {
      missing: [],
      unknown: [{ match: '**/*.md', skill: 'docs-writing' }],
    }),
  ).toStrictEqual({
    systemMessage: warning,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warning },
  });
});

test('it warns without a denial when the rules file is broken', () => {
  const warning = 'skill-gate: .claude/skill-gate.json `gates` must be an array.';

  expect(
    buildSkillGateOutput(
      '/repo/src/a.ts',
      { missing: [], unknown: [] },
      { rulesError: '`gates` must be an array' },
    ),
  ).toStrictEqual({
    systemMessage: warning,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warning },
  });
});

test('it carries the rule warning on a denial for another skill', () => {
  const warning =
    'skill-gate: the rule "**/*.test.ts" in .claude/skill-gate.json names the skill "project-testing", but .claude/skills/project-testing/SKILL.md does not exist. Fix the rule or add the skill; until then the gate skips that skill.';

  expect(
    buildSkillGateOutput('/repo/src/a.test.ts', {
      missing: ['testing'],
      unknown: [{ match: '**/*.test.ts', skill: 'project-testing' }],
    }),
  ).toStrictEqual({
    systemMessage: warning,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing /repo/src/a.test.ts, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n${warning}`,
    },
  });
});
