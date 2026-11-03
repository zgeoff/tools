import { expect, test } from 'bun:test';
import { runLintTree } from './run-lint-tree.ts';

test('it lints only the target of the tree', async () => {
  const result = await runLintTree(
    {
      'src/clean.ts': 'export const cups = 2;\n',
      'src/documented.ts': '/**\n * Documents the export.\n */\nexport const answer = 42;\n',
    },
    'src/clean.ts',
    { 'zgeoff/no-jsdoc': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it reports a problem in the target', async () => {
  const result = await runLintTree(
    { 'src/documented.ts': '/**\n * Documents the export.\n */\nexport const answer = 42;\n' },
    'src/documented.ts',
    { 'zgeoff/no-jsdoc': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});
