import { formatSkillList } from './format-skill-list.ts';
import type { Harness } from './harness.ts';
import { pickHarnessWording } from './pick-harness-wording.ts';
import type { SkillGateHookOutput } from './types.ts';

const RULES_PATH = '.claude/skill-gate.json';

export function buildBashSkillGateOutput(
  gatedPaths: readonly string[],
  missing: readonly string[],
  context: { readonly compacted?: boolean; readonly harness?: Harness } = {},
): SkillGateHookOutput | null {
  if (gatedPaths.length === 0) {
    return null;
  }

  const subject =
    gatedPaths.length === 1
      ? `${gatedPaths[0]} is a gated path, so change it`
      : `${gatedPaths.join(', ')} are gated paths, so change them`;

  const wording = pickHarnessWording(context.harness);
  const load = buildLoadInstruction(missing, context.compacted === true, wording.loadSkill);
  const rule = `${subject} with the ${wording.editTools} tool, never through Bash.`;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `skill-gate: this Bash command writes a gated path and runs anyway.${load} ${rule} ${RULES_PATH} lists the skills each path needs.`,
    },
  };
}

function buildLoadInstruction(
  missing: readonly string[],
  compacted: boolean,
  loadSkill: string,
): string {
  if (missing.length === 0) {
    return '';
  }

  return compacted
    ? ` Load the ${formatSkillList(missing)} again ${loadSkill} before the next change. This session was compacted, and a skill loaded before the compaction no longer counts.`
    : ` Load the ${formatSkillList(missing)} ${loadSkill} before the next change.`;
}
