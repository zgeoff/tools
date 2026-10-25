import { expect, test } from 'bun:test';
import { runLintTree } from './test-utils/run-lint-tree.ts';

test.each([
  [
    'a disable with no reason',
    "// oxlint-disable-next-line zgeoff/max-test-timeout\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a floor with no evidence after it',
    "// oxlint-disable-next-line zgeoff/max-test-timeout -- 48 s on CI; floor:\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a block comment whose floor holds only continuation stars',
    "/* oxlint-disable-next-line zgeoff/max-test-timeout -- 48 s on CI; floor:\n *\n */\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a reason with no ticket',
    "// oxlint-disable-next-line zgeoff/max-test-timeout -- 48 s on CI\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a disable of the same line',
    "test('it restores', { timeout: 60_000 }, () => {}); // oxlint-disable-line zgeoff/max-test-timeout -- 48 s on CI\n",
  ],
  [
    'a file-level disable',
    "/* oxlint-disable zgeoff/max-test-timeout -- slow restores */\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a file-level disable in a line comment',
    "// oxlint-disable zgeoff/max-test-timeout -- slow restores\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a disable that lists several rules',
    "// oxlint-disable-next-line no-console, zgeoff/max-test-timeout -- 48 s on CI\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'an eslint-disable comment',
    "// eslint-disable-next-line zgeoff/max-test-timeout\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a block comment whose rule name sits on the next line',
    "/* oxlint-disable-next-line\n   zgeoff/max-test-timeout */\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
])('it reports %s', async (_, body) => {
  const source = `import { test } from 'bun:test';\n\n${body}`;

  const result = await runLintTree({ 'restore.test.ts': source }, 'restore.test.ts', {
    'zgeoff/max-test-timeout': 'error',
    'zgeoff/test-timeout-exception-ticket': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(test-timeout-exception-ticket)');
  expect(result.stdout).not.toInclude('zgeoff(max-test-timeout):');
});

test.each([
  [
    'a reason that names a ticket',
    "// oxlint-disable-next-line zgeoff/max-test-timeout -- 48 s on CI, OPS-212\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a reason that cites a floor with its evidence',
    "// oxlint-disable-next-line zgeoff/max-test-timeout -- 48 s on CI; floor: two VM boots plus a restore\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a floor whose evidence starts with punctuation',
    "// oxlint-disable-next-line zgeoff/max-test-timeout -- 48 s on CI; floor: (two VM boots) plus a restore\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a block comment whose floor evidence sits on the next line',
    "/* oxlint-disable-next-line zgeoff/max-test-timeout -- 48 s on CI; floor:\n * two VM boots plus a restore\n */\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a reason that starts right after --',
    "// oxlint-disable-next-line zgeoff/max-test-timeout --48 s on CI, OPS-212\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a block comment whose ticket sits on the next line',
    "/* oxlint-disable-next-line zgeoff/max-test-timeout --\n   48 s on CI, OPS-212 */\ntest('it restores', { timeout: 60_000 }, () => {});\n",
  ],
  [
    'a disable of another rule whose reason names this one',
    "// oxlint-disable-next-line no-unused-vars -- kept beside zgeoff/max-test-timeout\nconst unused = 1;\n\ntest('it runs', () => {});\n",
  ],
  [
    'directive text inside strings and templates',
    "export const single = '// oxlint-disable zgeoff/max-test-timeout';\nexport const template = `\n// oxlint-disable-next-line zgeoff/max-test-timeout\n`;\n\ntest('it runs', () => {});\n",
  ],
])('it accepts %s', async (_, body) => {
  const source = `import { test } from 'bun:test';\n\n${body}`;

  const result = await runLintTree({ 'restore.test.ts': source }, 'restore.test.ts', {
    'zgeoff/max-test-timeout': 'error',
    'zgeoff/test-timeout-exception-ticket': 'error',
    'no-unused-vars': 'error',
  });

  expect(result.stdout).not.toInclude('zgeoff(');
  expect(result.exitCode).toBe(0);
});
