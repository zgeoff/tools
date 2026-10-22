import { formatSkillList } from './format-skill-list.ts';
import { formatUnknownKeyWarning } from './format-unknown-key-warning.ts';
import type { SkillGateHookOutput, ToolGatePlan, UnknownToolRequirement } from './types.ts';

// Builds the PreToolUse hook output for a gated tool call, or null when the call goes ahead in
// silence. A missing skill or reference denies the call. A rule that names one the repo does not
// have, or a key the rules parser does not know, never denies: it warns, and the call goes ahead.
export function buildToolGateOutput(
  toolName: string,
  plan: ToolGatePlan,
  context: { readonly compacted?: boolean; readonly unknownKeys?: readonly string[] } = {},
): SkillGateHookOutput | null {
  const warnings = [
    ...(context.unknownKeys ?? []).map((key) => formatUnknownKeyWarning(key)),
    ...plan.unknown.map((entry) => formatUnknownWarning(entry)),
  ];

  const warning = warnings.length === 0 ? undefined : warnings.join('\n');

  if (plan.missingSkills.length > 0 || plan.missingReferences.length > 0) {
    const reason = buildDenyReason(toolName, plan, context.compacted === true);

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

const RULES_PATH = '.claude/skill-gate.json';

function formatUnknownWarning(entry: UnknownToolRequirement): string {
  return entry.kind === 'skill'
    ? `skill-gate: the tool gate "${entry.tool}" in ${RULES_PATH} names the skill "${entry.name}", but .claude/skills/${entry.name}/SKILL.md does not exist. Fix the rule or add the skill; until then the gate skips that skill.`
    : `skill-gate: the tool gate "${entry.tool}" in ${RULES_PATH} names the reference "${entry.name}", but .claude/skills/${entry.name} does not exist. Fix the rule or add the file; until then the gate skips that reference.`;
}

function buildDenyReason(toolName: string, plan: ToolGatePlan, compacted: boolean): string {
  const again = compacted ? ' again' : '';

  const steps = [
    ...(plan.missingSkills.length === 0
      ? []
      : [`load the ${formatSkillList(plan.missingSkills)}${again} with the Skill tool`]),
    ...(plan.missingReferences.length === 0
      ? []
      : [`read ${formatReferenceList(plan.missingReferences)}${again} with the Read tool`]),
  ].join(' and ');

  const compaction = compacted
    ? ' This session was compacted, and a skill or reference loaded before the compaction no longer counts.'
    : '';

  return `Before calling ${toolName}, ${steps}, then retry the call.${compaction} ${RULES_PATH} lists the skills and references each tool needs.`;
}

function formatReferenceList(references: readonly string[]): string {
  const paths = references.map((reference) => `.claude/skills/${reference}`);

  if (paths.length === 1) {
    return `${paths[0]}`;
  }

  return `${paths.slice(0, -1).join(', ')} and ${paths.at(-1)}`;
}
