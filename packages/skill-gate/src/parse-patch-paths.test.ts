import { expect, test } from 'bun:test';
import { parsePatchPaths } from './parse-patch-paths.ts';

test('it lists the path of every Add, Update, Delete and Move to header once', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: src/new.ts',
    '+export const a = 1;',
    '*** Update File: /repo/src/old.ts',
    '*** Move to: src/moved.ts',
    '@@',
    '-a',
    '+b',
    '*** Delete File: docs/gone.md',
    '*** Update File: src/new.ts',
    '*** End Patch',
  ].join('\n');

  expect(parsePatchPaths(patch)).toStrictEqual([
    'src/new.ts',
    '/repo/src/old.ts',
    'src/moved.ts',
    'docs/gone.md',
  ]);
});

test('it ignores a content line that looks like a header', () => {
  expect(
    parsePatchPaths(
      ['*** Begin Patch', '*** Add File: a.md', '+*** Add File: b.md', '*** End Patch'].join('\n'),
    ),
  ).toStrictEqual(['a.md']);
});
