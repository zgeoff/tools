import { expect, test } from 'bun:test';
import { readPinnedSources } from './read-pinned-sources.ts';

test('it reads each reusable workflow, the downloaded files and every step script import', async () => {
  const files: Record<string, string> = {
    '.github/workflows/bake.yml': 'on:\n  workflow_call:\njobs: {}\n',
    '.github/workflows/nightly.yml': 'on:\n  schedule: []\njobs: {}\n',
    'scripts/repo-sync/sync-entries.ts': "import { knead } from './knead-dough.ts';\n\nknead();\n",
    'scripts/repo-sync/knead-dough.ts': 'export function knead() {}\n',
  };

  const sources = await readPinnedSources({
    workflowPaths: ['.github/workflows/bake.yml', '.github/workflows/nightly.yml'],
    readFile: (path) => Promise.resolve(files[path] ?? null),
  });

  expect(sources).toIncludeAllMembers([
    '.github/workflows/bake.yml',
    '.bun-version',
    'scripts/ci/download-step-scripts.ts',
    'scripts/repo-sync/sync-entries.ts',
    'scripts/repo-sync/knead-dough.ts',
  ]);

  expect(sources).not.toContain('.github/workflows/nightly.yml');
});

test.each([
  ['a string trigger', 'on: workflow_call\n'],
  ['a list of triggers', 'on: [push, workflow_call]\n'],
])('it counts a workflow with %s as reusable', async (_label, text) => {
  const sources = await readPinnedSources({
    workflowPaths: ['.github/workflows/bake.yml'],
    readFile: (path) => {
      const found = path === '.github/workflows/bake.yml' ? text : null;

      return Promise.resolve(found);
    },
  });

  expect(sources).toContain('.github/workflows/bake.yml');
});

test('it skips a file under the workflows folder that is not YAML, and a workflow it cannot parse', async () => {
  const files: Record<string, string> = {
    '.github/workflows/bake.ts': 'export const oven = 1;\n',
    '.github/workflows/broken.yml': 'on: [workflow_call\n',
  };

  const sources = await readPinnedSources({
    workflowPaths: ['.github/workflows/bake.ts', '.github/workflows/broken.yml'],
    readFile: (path) => Promise.resolve(files[path] ?? null),
  });

  expect(sources).not.toContain('.github/workflows/bake.ts');
  expect(sources).not.toContain('.github/workflows/broken.yml');
});
