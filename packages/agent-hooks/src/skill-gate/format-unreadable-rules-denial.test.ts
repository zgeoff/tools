import { expect, test } from 'bun:test';
import { formatUnreadableRulesDenial } from './format-unreadable-rules-denial.ts';

test('it names the cause, the blocked call and the repair on its own last line', () => {
  expect(
    formatUnreadableRulesDenial({
      reason: 'EACCES: permission denied',
      call: 'this Bash command',
      repair: 'chmod u+r .claude/skill-gate.json',
    }),
  ).toBe(
    'skill-gate: .claude/skill-gate.json exists but the gate cannot read it as a file (EACCES: permission denied), so it blocks this Bash command. Until the file reads again, the gate treats every path and tool as gated. You cannot repair it from here: ask the user to run this from the repo root, then retry:\nchmod u+r .claude/skill-gate.json',
  );
});
