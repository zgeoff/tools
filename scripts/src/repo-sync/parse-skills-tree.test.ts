import { expect, test } from 'bun:test';
import { parseSkillsTree } from './parse-skills-tree.ts';

test('it reads the path and mode of each blob, and leaves out a folder', () => {
  const value = {
    sha: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    truncated: false,
    tree: [
      { path: 'skills/kettle', mode: '040000', type: 'tree' },
      { path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' },
      { path: 'skills/kettle/scripts/boil.sh', mode: '100755', type: 'blob' },
    ],
  };

  expect(parseSkillsTree(value)).toStrictEqual([
    { path: 'skills/kettle/SKILL.md', mode: '100644' },
    { path: 'skills/kettle/scripts/boil.sh', mode: '100755' },
  ]);
});

test.each([
  [
    'a truncated tree',
    { truncated: true, tree: [{ path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' }] },
  ],
  ['a tree with no truncated flag', { tree: [] }],
  ['a tree that is not a list', { truncated: false, tree: {} }],
  ['an item with no path', { truncated: false, tree: [{ mode: '100644', type: 'blob' }] }],
  ['a list in place of a tree', []],
])('it refuses %s', (_label, value) => {
  expect(parseSkillsTree(value)).toBeNull();
});
