import { expect, test } from 'bun:test';
import { buildBashCheckFailureOutput } from './build-bash-check-failure-output.ts';

test('it warns the user and the agent that git failed and the command went unchecked', () => {
  expect(
    buildBashCheckFailureOutput('PostToolUse', 'fatal: index file smaller than expected\n'),
  ).toStrictEqual({
    systemMessage:
      'skill-gate: git failed, so the gate could not check what this Bash command changed: fatal: index file smaller than expected',
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        'skill-gate: git failed, so the gate could not check what this Bash command changed: fatal: index file smaller than expected',
    },
  });
});
