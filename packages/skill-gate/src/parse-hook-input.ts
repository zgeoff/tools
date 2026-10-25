import { isRecord } from '@zgeoff/std';
import { match } from 'ts-pattern';
import type { Harness } from './harness.ts';
import { parsePatchPaths } from './parse-patch-paths.ts';
import type { HookEvent, HookInput, LifecycleInput } from './types.ts';

export function parseHookInput(
  harness: Harness,
  value: unknown,
): HookInput | LifecycleInput | null {
  return match(harness)
    .with('claude-code', () => parseClaudeInput(value))
    .with('codex', () => parseCodexInput(value))
    .exhaustive();
}

function parseClaudeInput(value: unknown): HookInput | null {
  if (!isRecord(value) || !isRecord(value['tool_input'])) {
    return null;
  }

  const cwd = value['cwd'];
  const transcriptPath = value['transcript_path'];
  const editPath = value['tool_input']['file_path'];
  const command = value['tool_input']['command'];
  const toolName = value['tool_name'];

  if (typeof cwd !== 'string' || typeof transcriptPath !== 'string') {
    return null;
  }

  if (typeof editPath !== 'string' && typeof command !== 'string' && typeof toolName !== 'string') {
    return null;
  }

  return {
    kind: 'tool',
    harness: 'claude-code',
    event: pickHookEvent(value['hook_event_name']),
    toolName: typeof toolName === 'string' ? toolName : null,
    cwd,
    editPaths: typeof editPath === 'string' ? [editPath] : [],
    command: typeof command === 'string' ? command : null,
    transcriptPath,
    sessionID: null,
    toolUseID: value['tool_use_id'],
    agentID: value['agent_id'],
  };
}

function pickHookEvent(value: unknown): HookEvent {
  return value === 'PostToolUse' || value === 'PostToolUseFailure' ? value : 'PreToolUse';
}

// Codex reports a shell command as Bash and a file edit as apply_patch, and both carry their text
// in tool_input.command. Any other tool call is a gated tool's.
function parseCodexInput(value: unknown): HookInput | LifecycleInput | null {
  if (!isRecord(value) || typeof value['cwd'] !== 'string') {
    return null;
  }

  const cwd = value['cwd'];
  const transcriptPath = pickString(value['transcript_path']);
  const sessionID = pickString(value['session_id']);
  const event = value['hook_event_name'];

  if (event === 'UserPromptSubmit' || event === 'PostCompact') {
    return {
      kind: 'lifecycle',
      event,
      cwd,
      transcriptPath,
      sessionID,
      prompt: pickString(value['prompt']),
    };
  }

  const toolName = value['tool_name'];

  if ((event !== 'PreToolUse' && event !== 'PostToolUse') || typeof toolName !== 'string') {
    return null;
  }

  const toolInput = value['tool_input'];
  const text = isRecord(toolInput) ? pickString(toolInput['command']) : null;

  return {
    kind: 'tool',
    harness: 'codex',
    event,
    toolName,
    cwd,
    editPaths: toolName === 'apply_patch' && text !== null ? parsePatchPaths(text) : [],
    command: toolName === 'Bash' ? text : null,
    transcriptPath,
    sessionID,
    toolUseID: value['tool_use_id'],
    agentID: undefined,
  };
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
