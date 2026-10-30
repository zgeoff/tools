import { formatUnknownKeyWarning } from './format-unknown-key-warning.ts';
import type { SkillGateOutputContext, UnknownSkill } from './types.ts';

const RULES_PATH = '.claude/skill-gate.json';

export function collectRuleWarnings(
  unknown: readonly UnknownSkill[],
  context: SkillGateOutputContext,
): readonly string[] {
  return [
    ...(context.rulesError === undefined
      ? []
      : [`skill-gate: ${RULES_PATH} ${context.rulesError}.`]),
    ...(context.unknownKeys ?? []).map((key) => formatUnknownKeyWarning(key)),
    ...unknown.map(
      (entry) =>
        `skill-gate: the rule "${entry.match}" in ${RULES_PATH} names the skill "${entry.skill}", but .claude/skills/${entry.skill}/SKILL.md does not exist. Fix the rule or add the skill; until then the gate skips that skill.`,
    ),
  ];
}
