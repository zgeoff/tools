import { expect, test } from 'bun:test';
import { buildBashSkillGateOutput } from './build-bash-skill-gate-output.ts';

test('it returns null when the command writes no gated path', () => {
  expect(buildBashSkillGateOutput([], [])).toBeNull();
});

test('it warns on a command that writes gated paths and names the skills to load', () => {
  expect(
    buildBashSkillGateOutput(
      ['/repo/src/a.test.ts', '/repo/README.md'],
      ['testing', 'docs-writing'],
    ),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        'skill-gate: this Bash command writes a gated path and runs anyway. Load the `testing` and `docs-writing` skills with the Skill tool before the next change. /repo/src/a.test.ts, /repo/README.md are gated paths, so change them with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
    },
  });
});

test('it warns on a command that writes a gated path after a compaction and says to load again', () => {
  expect(
    buildBashSkillGateOutput(['/repo/src/a.test.ts'], ['testing'], { compacted: true }),
  ).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        'skill-gate: this Bash command writes a gated path and runs anyway. Load the `testing` skill again with the Skill tool before the next change. This session was compacted, and a skill loaded before the compaction no longer counts. /repo/src/a.test.ts is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
    },
  });
});

test('it warns on a command that writes a gated path when no skill is missing', () => {
  expect(buildBashSkillGateOutput(['/repo/src/a.test.ts'], [])).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        'skill-gate: this Bash command writes a gated path and runs anyway. /repo/src/a.test.ts is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.',
    },
  });
});
