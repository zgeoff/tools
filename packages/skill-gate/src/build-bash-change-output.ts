import { match } from 'ts-pattern';
import { formatSkillList } from './format-skill-list.ts';
import type { BashChangeHookOutput, PostToolEvent } from './types.ts';

const RULES_PATH = '.claude/skill-gate.json';

export function buildBashChangeOutput(
  event: PostToolEvent,
  changedPaths: readonly string[],
  missing: readonly string[],
  context: { readonly compacted?: boolean } = {},
): BashChangeHookOutput | null {
  if (changedPaths.length === 0 || missing.length === 0) {
    return null;
  }

  const subject =
    changedPaths.length === 1
      ? `changed the gated path ${changedPaths[0]}`
      : `changed the gated paths ${changedPaths.join(', ')}`;

  const pronoun = missing.length === 1 ? 'it' : 'them';
  const review = `then review what the command changed against ${pronoun} and fix what breaks a rule.`;

  const load =
    context.compacted === true
      ? `Load the ${formatSkillList(missing)} again with the Skill tool, ${review} This session was compacted, and a skill loaded before the compaction no longer counts.`
      : `Load the ${formatSkillList(missing)} with the Skill tool, ${review}`;

  const reason = `skill-gate: this Bash command ${subject} before the session loaded the skills it needs. ${load} Change a gated path only with Edit, Write or MultiEdit, never through Bash. ${RULES_PATH} lists the skills each path needs.`;

  // Claude Code cannot block a failed command, so a failure gets the reason as context.
  return match(event)
    .returnType<BashChangeHookOutput>()
    .with('PostToolUse', () => ({ decision: 'block', reason }))
    .with('PostToolUseFailure', () => ({
      hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: reason },
    }))
    .exhaustive();
}
