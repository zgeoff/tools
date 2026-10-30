import type { BashCheckFailureHookOutput, PostToolEvent } from './types.ts';

export function buildBashCheckFailureOutput(
  event: PostToolEvent,
  error: string,
): BashCheckFailureHookOutput {
  const warning = `skill-gate: git failed, so the gate could not check what this Bash command changed: ${error.trim()}`;

  return {
    systemMessage: warning,
    hookSpecificOutput: { hookEventName: event, additionalContext: warning },
  };
}
