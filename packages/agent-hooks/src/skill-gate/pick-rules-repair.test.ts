import { expect, test } from 'bun:test';
import { pickRulesRepair } from './pick-rules-repair.ts';

test.each([
  [
    'a folder where git tracks a regular file',
    'folder',
    true,
    'mv .claude/skill-gate.json .claude/skill-gate.json.broken && git checkout -- .claude/skill-gate.json',
  ],
  [
    'a folder where git tracks no regular file',
    'folder',
    false,
    "Move whatever is at .claude/skill-gate.json aside and put the repo's rules file back in its place. Removing the path without putting the file back turns the gate off.",
  ],
  ['a file the hook may not read', 'file-permission', false, 'chmod u+r .claude/skill-gate.json'],
  [
    'any other cause',
    'other',
    true,
    "Move whatever is at .claude/skill-gate.json aside and put the repo's rules file back in its place. Removing the path without putting the file back turns the gate off.",
  ],
] as const)('it picks the repair for %s', (_label, cause, isTrackedFile, repair) => {
  expect(pickRulesRepair(cause, isTrackedFile)).toBe(repair);
});
