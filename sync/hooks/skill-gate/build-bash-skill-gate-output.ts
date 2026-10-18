import { formatSkillList } from './format-skill-list.ts';
import type { SkillGateHookOutput } from './types.ts';

const RULES_PATH = '.claude/skill-gate.json';

// Builds the PreToolUse hook output for a Bash command, or null when it writes no gated path. A
// gated path changes only through Edit, Write or MultiEdit, so the command is denied even once the
// session has loaded the skills, and the reason names the skills it still has to load.
export function buildBashSkillGateOutput(
  gatedPaths: readonly string[],
  missing: readonly string[],
  context: { readonly compacted?: boolean } = {},
): SkillGateHookOutput | null {
  if (gatedPaths.length === 0) {
    return null;
  }

  const subject =
    gatedPaths.length === 1
      ? `${gatedPaths[0]} is a gated path, so change it`
      : `${gatedPaths.join(', ')} are gated paths, so change them`;

  const rule = `${subject} with the Edit, Write or MultiEdit tool, never through Bash.`;
  const load = buildLoadInstruction(missing, context.compacted === true);

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${rule}${load} ${RULES_PATH} lists the skills each path needs.`,
    },
  };
}

function buildLoadInstruction(missing: readonly string[], compacted: boolean): string {
  if (missing.length === 0) {
    return '';
  }

  return compacted
    ? ` Load the ${formatSkillList(missing)} again with the Skill tool first. This session was compacted, and a skill loaded before the compaction no longer counts.`
    : ` Load the ${formatSkillList(missing)} with the Skill tool first.`;
}
