import { isRecord } from '@zgeoff/std';
import type { HookPlan } from './types.ts';

export function buildHookSettings(
  settings: Readonly<Record<string, unknown>>,
  plan: HookPlan,
): Readonly<Record<string, unknown>> | string {
  const hooks = settings['hooks'] ?? {};

  if (!isRecord(hooks)) {
    return '`hooks` must hold a JSON object';
  }

  const kept: Record<string, unknown> = {};

  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      return `\`hooks.${event}\` must be an array`;
    }

    const remaining = groups.flatMap((group: unknown) => dropOwnedHooks(group));

    if (remaining.length > 0) {
      kept[event] = remaining;
    }
  }

  for (const entry of plan.events) {
    const group = {
      ...(entry.matcher === undefined ? {} : { matcher: entry.matcher }),
      hooks: [{ type: 'command', command: plan.command }],
    };

    const existing = kept[entry.event];

    kept[entry.event] = Array.isArray(existing) ? [...existing, group] : [group];
  }

  return { ...settings, hooks: kept };
}

function dropOwnedHooks(group: unknown): readonly unknown[] {
  if (!isRecord(group) || !Array.isArray(group['hooks'])) {
    return [group];
  }

  const hooks = group['hooks'].filter((hook: unknown) => !isOwnedHook(hook));

  return hooks.length === 0 ? [] : [{ ...group, hooks }];
}

// The skill-gate path is the entry point that this hook replaces, so an entry for it goes too.
const OWNED_COMMAND_PATHS = ['.claude/hooks/start.ts', '.claude/hooks/skill-gate/skill-gate.ts'];

function isOwnedHook(hook: unknown): boolean {
  if (!isRecord(hook) || typeof hook['command'] !== 'string') {
    return false;
  }

  const command = hook['command'];

  return OWNED_COMMAND_PATHS.some((commandPath) => command.includes(commandPath));
}
