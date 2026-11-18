import { expect, test } from 'bun:test';
import { buildBenchFolderPath } from './build-bench-folder-path.ts';

test.each([
  ['the relative git folder of a main checkout', '/kettle', '.git', '/kettle/.git/rig-bench'],
  [
    'the absolute common git folder of a linked worktree',
    '/spout/linked',
    '/kettle/.git',
    '/kettle/.git/rig-bench',
  ],
  ['a relative git folder in a parent folder', '/kettle/lid', '../.git', '/kettle/.git/rig-bench'],
])('it places the bench folder in %s', (_title, repoRoot, gitCommonDir, expected) => {
  expect(buildBenchFolderPath(repoRoot, gitCommonDir)).toBe(expected);
});
