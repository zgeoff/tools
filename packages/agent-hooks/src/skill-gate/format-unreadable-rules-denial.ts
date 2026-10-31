const RULES_PATH = '.claude/skill-gate.json';

export interface UnreadableRulesDenial {
  readonly reason: string;
  readonly call: string;
  readonly repair: string;
}

export function formatUnreadableRulesDenial(denial: UnreadableRulesDenial): string {
  return `skill-gate: ${RULES_PATH} exists but the gate cannot read it as a file (${denial.reason}), so it blocks ${denial.call}. Until the file reads again, the gate treats every path and tool as gated. You cannot repair it from here: ask the user to run this from the repo root, then retry:\n${denial.repair}`;
}
