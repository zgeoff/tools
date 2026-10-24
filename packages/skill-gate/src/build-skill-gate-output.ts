import { formatSkillList } from './format-skill-list.ts';
import { formatUnknownKeyWarning } from './format-unknown-key-warning.ts';
import type { SkillGateHookOutput, SkillGateOutputContext, SkillGatePlan } from './types.ts';

const RULES_PATH = '.claude/skill-gate.json';

const EDIT_TOOLS_NOTE =
  'Change a gated path only with Edit, Write or MultiEdit, never through Bash.';

export function buildSkillGateOutput(
  filePath: string,
  plan: SkillGatePlan,
  context: SkillGateOutputContext = {},
): SkillGateHookOutput | null {
  const warnings = [
    ...(context.rulesError === undefined
      ? []
      : [`skill-gate: ${RULES_PATH} ${context.rulesError}.`]),
    ...(context.unknownKeys ?? []).map((key) => formatUnknownKeyWarning(key)),
    ...plan.unknown.map(
      (entry) =>
        `skill-gate: the rule "${entry.match}" in ${RULES_PATH} names the skill "${entry.skill}", but .claude/skills/${entry.skill}/SKILL.md does not exist. Fix the rule or add the skill; until then the gate skips that skill.`,
    ),
  ];

  const warning = warnings.length === 0 ? undefined : warnings.join('\n');

  if (plan.missing.length > 0) {
    const reason =
      context.compacted === true
        ? `Load the ${formatSkillList(plan.missing)} again with the Skill tool before editing ${filePath}, then retry the edit. This session was compacted, and a skill loaded before the compaction no longer counts. ${EDIT_TOOLS_NOTE} ${RULES_PATH} lists the skills each path needs.`
        : `Load the ${formatSkillList(plan.missing)} with the Skill tool before editing ${filePath}, then retry the edit. ${EDIT_TOOLS_NOTE} ${RULES_PATH} lists the skills each path needs.`;

    return {
      ...(warning === undefined ? {} : { systemMessage: warning }),
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: warning === undefined ? reason : `${reason}\n${warning}`,
      },
    };
  }

  if (warning === undefined) {
    return null;
  }

  return {
    systemMessage: warning,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warning },
  };
}
