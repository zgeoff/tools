import { collectGateSkills } from './collect-gate-skills.ts';
import { planSkillGate } from './plan-skill-gate.ts';
import type { BashSkillGateInput, BashSkillGatePlan } from './types.ts';

// Plans the gate for one Bash command from the project paths it writes: the paths a gate matches,
// and the skills those paths need that the session has not loaded, in gate order without repeats.
export function planBashSkillGate(input: BashSkillGateInput): BashSkillGatePlan {
  const gated = input.paths.filter(
    (entry) => collectGateSkills(input.rules, entry.relativePath).length > 0,
  );

  const missing = gated.flatMap(
    (entry) =>
      planSkillGate({
        rules: input.rules,
        relativePath: entry.relativePath,
        loadedSkills: input.loadedSkills,
        availableSkills: input.availableSkills,
      }).missing,
  );

  return { gatedPaths: gated.map((entry) => entry.path), missing: [...new Set(missing)] };
}
