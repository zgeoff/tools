import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildHookSettings } from './build-hook-settings.ts';

test('it adds one stub entry per event and keeps the other settings and hooks', () => {
  const settings = buildHookSettings(
    {
      permissions: { allow: ['Bash(git status)'] },
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'bun lint-hook.ts' }] },
        ],
      },
    },
    {
      command: 'bun .claude/hooks/start.ts',
      events: [{ event: 'PreToolUse', matcher: 'Edit|Bash' }, { event: 'Stop' }],
    },
  );

  expect(settings).toStrictEqual({
    permissions: { allow: ['Bash(git status)'] },
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'bun lint-hook.ts' }] },
        {
          matcher: 'Edit|Bash',
          hooks: [{ type: 'command', command: 'bun .claude/hooks/start.ts' }],
        },
      ],
      Stop: [{ hooks: [{ type: 'command', command: 'bun .claude/hooks/start.ts' }] }],
    },
  });
});

test('it replaces the skill-gate entry point and an earlier stub entry', () => {
  const settings = buildHookSettings(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Edit|Write',
            hooks: [
              {
                type: 'command',
                command:
                  'bun --no-install "$CLAUDE_PROJECT_DIR/.claude/hooks/skill-gate/skill-gate.ts"',
              },
              { type: 'command', command: 'bun lint-hook.ts' },
            ],
          },
        ],
        PostToolUseFailure: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'bun .claude/hooks/start.ts' }] },
        ],
      },
    },
    {
      command: 'bun .claude/hooks/start.ts',
      events: [{ event: 'PreToolUse', matcher: 'Edit|Write|Bash' }],
    },
  );

  expect(settings).toStrictEqual({
    hooks: {
      PreToolUse: [
        { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'bun lint-hook.ts' }] },
        {
          matcher: 'Edit|Write|Bash',
          hooks: [{ type: 'command', command: 'bun .claude/hooks/start.ts' }],
        },
      ],
    },
  });
});

test('it gives the same settings when it runs on its own output', () => {
  const plan = {
    command: 'bun .claude/hooks/start.ts',
    events: [{ event: 'PostToolUse', matcher: 'Bash' }],
  };

  const once = buildHookSettings({}, plan);

  invariant(typeof once !== 'string', 'the first run must build settings');

  expect(buildHookSettings(once, plan)).toStrictEqual(once);
});

test.each([
  [{ hooks: [] }, '`hooks` must hold a JSON object'],
  [{ hooks: { PreToolUse: { matcher: 'Bash' } } }, '`hooks.PreToolUse` must be an array'],
])('it refuses settings whose hooks it cannot read: %j', (settings, error) => {
  expect(buildHookSettings(settings, { command: 'bun .claude/hooks/start.ts', events: [] })).toBe(
    error,
  );
});
