import { collectGateSkills } from './collect-gate-skills.ts';
import type { SkillGateInput, SkillGatePlan, UnknownSkill } from './types.ts';

export function planSkillGate(input: SkillGateInput): SkillGatePlan {
  const unknown: UnknownSkill[] = input.rules.gates.flatMap((gate) =>
    gate.skills
      .filter((skill) => !input.availableSkills.includes(skill))
      .map((skill) => ({ match: gate.match, skill })),
  );

  const needed = collectGateSkills(input.rules, input.relativePath);

  const missing = needed.filter(
    (skill) => input.availableSkills.includes(skill) && !input.loadedSkills.includes(skill),
  );

  return { missing: [...new Set(missing)], unknown };
}
