import { expect, test } from 'bun:test';
import { pickRulesRepair } from './pick-rules-repair.ts';

test.each([
  [
    'a folder git tracks',
    'EISDIR',
    true,
    'mv .claude/skill-gate.json .claude/skill-gate.json.broken && git checkout -- .claude/skill-gate.json',
  ],
  [
    'a folder git does not track',
    'EISDIR',
    false,
    "Move whatever is at .claude/skill-gate.json aside and put the repo's rules file back in its place. Removing the path without putting the file back turns the gate off.",
  ],
  ['a file the hook cannot read', 'EACCES', true, 'chmod u+r .claude/skill-gate.json'],
  [
    'a symlink loop',
    'ELOOP',
    true,
    "Move whatever is at .claude/skill-gate.json aside and put the repo's rules file back in its place. Removing the path without putting the file back turns the gate off.",
  ],
  [
    'a path that is not a regular file',
    null,
    false,
    "Move whatever is at .claude/skill-gate.json aside and put the repo's rules file back in its place. Removing the path without putting the file back turns the gate off.",
  ],
])('it picks the repair for %s', (_label, code, isTracked, repair) => {
  expect(pickRulesRepair(code, isTracked)).toBe(repair);
});
