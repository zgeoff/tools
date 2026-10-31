import { join } from 'node:path';

// Builds the JSON that Claude Code hands a PreToolUse hook for a tool call in the project folder.
export function buildPreToolUsePayload(
  project: string,
  toolName: string,
  toolInput: Readonly<Record<string, unknown>>,
): string {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    cwd: project,
    transcript_path: join(project, 'transcript.jsonl'),
    tool_name: toolName,
    tool_input: toolInput,
  });
}
