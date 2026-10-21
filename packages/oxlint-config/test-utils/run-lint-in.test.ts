import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createLintTree } from './create-lint-tree.ts';
import { runLintIn } from './run-lint-in.ts';

test('it fails on a disable directive that suppresses nothing', async () => {
  const directory = await createLintTree(
    {
      'kettle.ts':
        '// oxlint-disable-next-line zgeoff/no-jsdoc -- no block\nexport const cups = 2;\n',
    },
    { 'zgeoff/no-jsdoc': 'error' },
  );

  const result = await runLintIn(directory, directory, 'kettle.ts');

  expect(result.exitCode).toBe(1);
});

test('it resolves the target from the working directory it runs in', async () => {
  const directory = await createLintTree(
    { 'packages/pot/kettle.ts': '/**\n * Documents the export.\n */\nexport const cups = 2;\n' },
    { 'zgeoff/no-jsdoc': 'error' },
  );

  const result = await runLintIn(directory, join(directory, 'packages', 'pot'), 'kettle.ts');

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});
