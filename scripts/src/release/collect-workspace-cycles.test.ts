import { expect, test } from 'bun:test';
import { collectWorkspaceCycles } from './collect-workspace-cycles.ts';

test('it returns a cycle that a dev dependency closes', () => {
  const cycles = collectWorkspaceCycles([
    { name: '@acme/ledger', devDependencies: { '@acme/sampler': 'workspace:*' } },
    { name: '@acme/sampler', dependencies: { '@acme/ledger': 'workspace:*' } },
  ]);

  expect(cycles).toStrictEqual([['@acme/ledger', '@acme/sampler', '@acme/ledger']]);
});

test.each(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])(
  'it follows %s',
  (field) => {
    const cycles = collectWorkspaceCycles([
      { name: '@acme/ledger', [field]: { '@acme/sampler': '1.0.0' } },
      { name: '@acme/sampler', dependencies: { '@acme/ledger': '1.0.0' } },
    ]);

    expect(cycles).toHaveLength(1);
  },
);

test('it returns a cycle through three packages once', () => {
  const cycles = collectWorkspaceCycles([
    { name: '@acme/ledger', dependencies: { '@acme/sampler': 'workspace:*' } },
    { name: '@acme/sampler', dependencies: { '@acme/teapot': 'workspace:*' } },
    { name: '@acme/teapot', dependencies: { '@acme/ledger': 'workspace:*' } },
  ]);

  expect(cycles).toStrictEqual([['@acme/ledger', '@acme/sampler', '@acme/teapot', '@acme/ledger']]);
});

test('it returns nothing for a graph with no cycle, and ignores packages outside the workspace', () => {
  const cycles = collectWorkspaceCycles([
    { name: '@acme/ledger', dependencies: { '@acme/sampler': 'workspace:*', zod: '4.0.0' } },
    { name: '@acme/sampler', devDependencies: { '@acme/teapot': 'workspace:*' } },
    { name: '@acme/teapot', dependencies: { zod: '4.0.0' } },
  ]);

  expect(cycles).toStrictEqual([]);
});
