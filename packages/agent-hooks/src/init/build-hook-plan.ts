import { match } from 'ts-pattern';
import type { Harness } from '../harness.ts';
import type { HookPlan } from './types.ts';

const STUB_PATH = '.claude/hooks/start.ts';

// Codex sets no CLAUDE_PROJECT_DIR, so its command finds the repo root with git.
export function buildHookPlan(harness: Harness, gatedTools: readonly string[]): HookPlan {
  const toolMatchers = gatedTools.map((tool) => escapeMatcher(tool));

  return match(harness)
    .returnType<HookPlan>()
    .with('claude-code', () => ({
      command: `bun --no-install "$CLAUDE_PROJECT_DIR/${STUB_PATH}"`,
      events: [
        {
          event: 'PreToolUse',
          matcher: ['Edit', 'Write', 'MultiEdit', 'Bash', ...toolMatchers].join('|'),
        },
        { event: 'PostToolUse', matcher: 'Bash' },
        { event: 'PostToolUseFailure', matcher: 'Bash' },
      ],
    }))
    .with('codex', () => ({
      command: `bun --no-install "$(git rev-parse --show-toplevel)/${STUB_PATH}" --harness codex`,
      events: [
        { event: 'PreToolUse', matcher: ['Bash', 'apply_patch', ...toolMatchers].join('|') },
        { event: 'PostToolUse', matcher: 'Bash' },
        { event: 'UserPromptSubmit' },
        { event: 'PostCompact' },
      ],
    }))
    .exhaustive();
}

// Both harnesses read a matcher as a regular expression.
function escapeMatcher(tool: string): string {
  return tool.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}
