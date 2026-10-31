import { expect, test } from 'bun:test';
import { buildHookPlan } from './build-hook-plan.ts';

test('it registers the stub for Claude Code before an edit, a Bash command or a gated tool, and after Bash', () => {
  const plan = buildHookPlan('claude-code', ['mcp__tracker__update_ticket']);

  expect(plan).toStrictEqual({
    command: 'bun --no-install "$CLAUDE_PROJECT_DIR/.claude/hooks/start.ts"',
    events: [
      { event: 'PreToolUse', matcher: 'Edit|Write|MultiEdit|Bash|mcp__tracker__update_ticket' },
      { event: 'PostToolUse', matcher: 'Bash' },
      { event: 'PostToolUseFailure', matcher: 'Bash' },
    ],
  });
});

test('it registers the stub for Codex with the harness flag, the patch tool and the ledger events', () => {
  const plan = buildHookPlan('codex', []);

  expect(plan).toStrictEqual({
    command:
      'bun --no-install "$(git rev-parse --show-toplevel)/.claude/hooks/start.ts" --harness codex',
    events: [
      { event: 'PreToolUse', matcher: 'Bash|apply_patch' },
      { event: 'PostToolUse', matcher: 'Bash' },
      { event: 'UserPromptSubmit' },
      { event: 'PostCompact' },
    ],
  });
});

test('it escapes a gated tool name that holds regular expression syntax', () => {
  const plan = buildHookPlan('claude-code', ['mcp__docs.v2__publish']);

  expect(plan.events[0]).toStrictEqual({
    event: 'PreToolUse',
    matcher: String.raw`Edit|Write|MultiEdit|Bash|mcp__docs\.v2__publish`,
  });
});
