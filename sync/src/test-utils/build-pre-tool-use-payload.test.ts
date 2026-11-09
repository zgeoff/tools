import { expect, test } from 'bun:test';
import { buildPreToolUsePayload } from './build-pre-tool-use-payload.ts';

test('it builds the PreToolUse payload of a tool call in the project folder', () => {
  const payload: unknown = JSON.parse(
    buildPreToolUsePayload('/work/kettle', 'Write', { file_path: '/work/kettle/guide.md' }),
  );

  expect(payload).toStrictEqual({
    hook_event_name: 'PreToolUse',
    cwd: '/work/kettle',
    transcript_path: '/work/kettle/transcript.jsonl',
    tool_name: 'Write',
    tool_input: { file_path: '/work/kettle/guide.md' },
  });
});
