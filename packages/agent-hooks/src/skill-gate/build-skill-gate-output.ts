import { collectRuleWarnings } from './collect-rule-warnings.ts';
import { formatSkillList } from './format-skill-list.ts';
import { pickHarnessWording } from './pick-harness-wording.ts';
import type { SkillGateHookOutput, SkillGateOutputContext, SkillGatePlan } from './types.ts';

const RULES_PATH = '.claude/skill-gate.json';

export function buildSkillGateOutput(
  filePath: string,
  plan: SkillGatePlan,
  context: SkillGateOutputContext = {},
): SkillGateHookOutput | null {
  const wording = pickHarnessWording(context.harness);
  const editToolsNote = `Change a gated path only with ${wording.editTools}, never through Bash.`;
  const warnings = collectRuleWarnings(plan.unknown, context);
  const warning = warnings.length === 0 ? undefined : warnings.join('\n');

  if (plan.missing.length > 0) {
    const reason =
      context.compacted === true
        ? `Load the ${formatSkillList(plan.missing)} again ${wording.loadSkill} before editing ${filePath}, then retry the edit. This session was compacted, and a skill loaded before the compaction no longer counts. ${editToolsNote} ${RULES_PATH} lists the skills each path needs.`
        : `Load the ${formatSkillList(plan.missing)} ${wording.loadSkill} before editing ${filePath}, then retry the edit. ${editToolsNote} ${RULES_PATH} lists the skills each path needs.`;

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
