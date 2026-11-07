import { expect, test } from 'bun:test';
import { createLintTree } from './create-lint-tree.ts';
import { runLintMessages } from './run-lint-messages.ts';

test('it returns the messages of the rule with their file and line, sorted by file', async () => {
  const directory = await createLintTree(
    {
      'b.ts': '\nswitch (1) {\n  default:\n}\n',
      'a.ts': 'switch (1) {\n  default:\n}\n',
    },
    { 'zgeoff/no-switch': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/no-switch', ['b.ts', 'a.ts']);

  expect(messages).toStrictEqual([
    {
      filename: 'a.ts',
      line: 1,
      message: 'Branch with match(...).exhaustive() from ts-pattern, never switch.',
    },
    {
      filename: 'b.ts',
      line: 2,
      message: 'Branch with match(...).exhaustive() from ts-pattern, never switch.',
    },
  ]);
});

test('it leaves out the messages of other rules', async () => {
  const directory = await createLintTree(
    { 'a.ts': "import { join } from 'node:path';\n" },
    { 'zgeoff/no-switch': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/no-switch', ['a.ts']);

  expect(messages).toStrictEqual([]);
});
