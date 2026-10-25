import { collectRuleWarnings } from './collect-rule-warnings.ts';
import { formatSkillList } from './format-skill-list.ts';
import { pickHarnessWording } from './pick-harness-wording.ts';
import type { EditEntry, SkillGateHookOutput, SkillGateOutputContext } from './types.ts';

const RULES_PATH = '.claude/skill-gate.json';

// A patch can change several paths at once, so the denial names the missing skills per path.
export function buildPatchGateOutput(
  entries: readonly EditEntry[],
  context: SkillGateOutputContext = {},
): SkillGateHookOutput | null {
  const wording = pickHarnessWording(context.harness);

  const warnings = collectRuleWarnings(
    entries.flatMap((entry) => entry.plan.unknown),
    context,
  );

  const warning = warnings.length === 0 ? undefined : [...new Set(warnings)].join('\n');
  const blocked = entries.filter((entry) => entry.plan.missing.length > 0);

  if (blocked.length > 0) {
    const needs = blocked
      .map((entry) => `${entry.filePath} needs the ${formatSkillList(entry.plan.missing)}`)
      .join('; ');

    const again = context.compacted === true ? ' again' : '';

    const compaction =
      context.compacted === true
        ? ' This session was compacted, and a skill loaded before the compaction no longer counts.'
        : '';

    const reason = `This patch changes a gated path before the session loaded the skills it needs: ${needs}. Load each missing skill${again} ${wording.loadSkill}, then retry the patch.${compaction} Change a gated path only with ${wording.editTools}, never through Bash. ${RULES_PATH} lists the skills each path needs.`;

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
