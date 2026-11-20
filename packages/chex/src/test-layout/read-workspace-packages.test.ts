import { expect, test } from 'bun:test';
import { readWorkspacePackages } from './read-workspace-packages.ts';

test('it reads the name and private flag of each workspace', async () => {
  const files: Record<string, string> = {
    'packages/kettle/package.json': '{"name":"@acme/kettle"}',
    'packages/harness/package.json': '{"name":"@acme/harness","private":true}',
    'packages/bare/package.json': '{}',
  };

  const packages = await readWorkspacePackages(
    ['packages/kettle', 'packages/harness', 'packages/bare'],
    (path) => Promise.resolve(files[path] ?? ''),
  );

  expect(packages).toStrictEqual([
    { root: 'packages/kettle', name: '@acme/kettle', isPrivate: false },
    { root: 'packages/harness', name: '@acme/harness', isPrivate: true },
    { root: 'packages/bare', name: '', isPrivate: false },
  ]);
});
