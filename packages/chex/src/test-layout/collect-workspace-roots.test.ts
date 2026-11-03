import { expect, test } from 'bun:test';
import { collectWorkspaceRoots } from './collect-workspace-roots.ts';

test('it collects the tracked package folders that a pattern matches', () => {
  const roots = collectWorkspaceRoots(
    [
      'package.json',
      'packages/kettle/package.json',
      'packages/teapot/package.json',
      'packages/teapot/src/nested/package.json',
      'scripts/package.json',
    ],
    ['packages/*'],
  );

  expect(roots).toStrictEqual(['packages/kettle', 'packages/teapot']);
});

test('it leaves out a folder that a negated pattern names', () => {
  const roots = collectWorkspaceRoots(
    ['packages/kettle/package.json', 'packages/teapot/package.json'],
    ['packages/*', '!packages/teapot'],
  );

  expect(roots).toStrictEqual(['packages/kettle']);
});

test('it matches a folder named in full', () => {
  expect(collectWorkspaceRoots(['sync/package.json'], ['sync'])).toStrictEqual(['sync']);
});
