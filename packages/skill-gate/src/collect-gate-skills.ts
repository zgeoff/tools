import picomatch from 'picomatch';
import type { SkillGateRules } from './types.ts';

// Collects the skills that every gate matching a path names, in gate order and with repeats. A
// path that holds an ignore segment matches no gate.
export function collectGateSkills(rules: SkillGateRules, relativePath: string): readonly string[] {
  if (rules.ignore.some((segment) => relativePath.includes(segment))) {
    return [];
  }

  return rules.gates
    .filter((gate) => isGlobMatch(gate.match, relativePath))
    .flatMap((gate) => gate.skills);
}

// picomatch skips a dot folder such as .claude by default, and a gate covers it.
function isGlobMatch(pattern: string, relativePath: string): boolean {
  return picomatch.isMatch(relativePath, pattern, { dot: true });
}
