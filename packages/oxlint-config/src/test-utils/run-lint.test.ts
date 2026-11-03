import { expect, test } from 'bun:test';
import { runLint } from './run-lint.ts';

test('it reports a problem in the source under the given rules', async () => {
  const result = await runLint('/**\n * Documents the export.\n */\nexport const answer = 42;\n', {
    'zgeoff/no-jsdoc': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});

test('it passes a source the given rules accept', async () => {
  const result = await runLint('export const answer = 42;\n', { 'zgeoff/no-jsdoc': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it leaves a disable directive that suppresses nothing unreported', async () => {
  const result = await runLint(
    '// oxlint-disable-next-line zgeoff/no-jsdoc -- no block\nexport const answer = 42;\n',
    { 'zgeoff/no-jsdoc': 'error' },
  );

  expect(result.exitCode).toBe(0);
});
