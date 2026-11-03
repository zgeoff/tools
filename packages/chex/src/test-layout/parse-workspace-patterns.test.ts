import { expect, test } from 'bun:test';
import { parseWorkspacePatterns } from './parse-workspace-patterns.ts';

test('it reads a repo with no workspaces field as one package', () => {
  expect(parseWorkspacePatterns({ name: 'kettle' })).toStrictEqual({ kind: 'single' });
});

test('it reads the list form of the workspaces field', () => {
  expect(parseWorkspacePatterns({ workspaces: ['packages/*'] })).toStrictEqual({
    kind: 'workspaces',
    patterns: ['packages/*'],
  });
});

test('it reads the packages list of the object form', () => {
  const parsed = parseWorkspacePatterns({ workspaces: { packages: ['apps/*'], catalog: {} } });

  expect(parsed).toStrictEqual({ kind: 'workspaces', patterns: ['apps/*'] });
});

test('it reads an empty workspaces field as a workspace repo with no pattern', () => {
  expect(parseWorkspacePatterns({ workspaces: [] })).toStrictEqual({
    kind: 'workspaces',
    patterns: [],
  });
});
