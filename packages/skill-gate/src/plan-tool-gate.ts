import path from 'node:path';
import type { ToolGateInput, ToolGatePlan, UnknownToolRequirement } from './types.ts';

// A skill or reference the repo lacks never counts as missing, since no session could load it.
export function planToolGate(input: ToolGateInput): ToolGatePlan {
  const gates = input.tools.filter((gate) => gate.tool === input.toolName);

  const unknown: UnknownToolRequirement[] = gates.flatMap((gate) => [
    ...gate.skills
      .filter((skill) => !input.availableSkills.includes(skill))
      .map((skill) => ({ tool: gate.tool, kind: 'skill' as const, name: skill })),
    ...gate.references
      .filter((reference) => !input.availableReferences.includes(reference))
      .map((reference) => ({ tool: gate.tool, kind: 'reference' as const, name: reference })),
  ]);

  const readPaths = new Set(input.loads.readPaths.map((readPath) => path.resolve(readPath)));

  const missingSkills = gates
    .flatMap((gate) => gate.skills)
    .filter(
      (skill) => input.availableSkills.includes(skill) && !input.loads.skills.includes(skill),
    );

  const missingReferences = gates
    .flatMap((gate) => gate.references)
    .filter(
      (reference) =>
        input.availableReferences.includes(reference) &&
        !readPaths.has(path.resolve(input.skillsDir, reference)),
    );

  return {
    missingSkills: [...new Set(missingSkills)],
    missingReferences: [...new Set(missingReferences)],
    unknown,
  };
}
