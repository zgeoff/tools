import { expect, test } from 'bun:test';
import { runLintTree } from './test-utils/run-lint-tree.ts';

test.each([
  ['a trailing number', "test('it brews', () => {}, 20_000);\n"],
  ['an options object', "test('it brews', () => {}, { timeout: 20_000 });\n"],
  ['an options object before the callback', "test('it brews', { timeout: 6000 }, () => {});\n"],
  ['an it call', "it('brews', () => {}, 20_000);\n"],
  ['a describe call', "describe('kettle', () => {}, 20_000);\n"],
  ['a modifier chain', "test.skipIf(false).each([1])('it brews %p', () => {}, 20_000);\n"],
  [
    'a const that holds the value',
    "const slowMs = 20 * 1000;\ntest('it brews', () => {}, slowMs);\n",
  ],
  ['setDefaultTimeout', 'setDefaultTimeout(20_000);\n'],
])('it reports a timeout above 5 s in %s', async (_, body) => {
  const source = `import { describe, it, setDefaultTimeout, test } from 'bun:test';\n\n${body}`;

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(max-test-timeout)');
  expect(result.stdout).toInclude('within the 5 s limit');
});

test('it names the timeout it reports', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('Keep this timeout of 20000 ms within the 5 s limit');
});

test('it reports a timeout on the global test that no import names', async () => {
  const result = await runLintTree(
    { 'kettle.test.ts': "test('it brews', () => {}, 20_000);\n" },
    'kettle.test.ts',
    { 'zgeoff/max-test-timeout': 'error' },
  );

  expect(result.stdout).toInclude('zgeoff(max-test-timeout)');
});

test('it reports a timeout on test under an alias of its import', async () => {
  const source =
    "import { test as check } from 'bun:test';\n\ncheck('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('zgeoff(max-test-timeout)');
});

test('it reports setDefaultTimeout in a preload that is not a test file', async () => {
  const source = "import { setDefaultTimeout } from 'bun:test';\n\nsetDefaultTimeout(30_000);\n";

  const result = await runLintTree({ 'preload.ts': source }, 'preload.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('zgeoff(max-test-timeout)');
});

test.each([
  ['a timeout of exactly 5 s', "test('it brews', () => {}, 5000);\n"],
  ['an options object with no timeout', "test('it brews', () => {}, { retry: 2 });\n"],
  ['a timeout the file cannot fix', "test('it brews', () => {}, Number(process.env.SLOW));\n"],
  ['the rows of test.each', "test.each([20_000])('it brews %p', () => {});\n"],
  ['setDefaultTimeout of 5 s', 'setDefaultTimeout(5000);\n'],
])('it accepts %s', async (_, body) => {
  const source = `import { setDefaultTimeout, test } from 'bun:test';\n\n${body}`;

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it skips a test function that does not come from bun:test', async () => {
  const source = "import { test } from './runner.ts';\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each([
  'e2e/kettle.test.ts',
  'e2e/helpers/preload.ts',
  'kettle.browser.test.ts',
  'kettle.docker.test.ts',
  'kettle.host.test.ts',
  'kettle.browser.test.tsx',
])('it exempts the lane file %s', async (path) => {
  const source =
    "import { setDefaultTimeout, test } from 'bun:test';\n\nsetDefaultTimeout(30_000);\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ [path]: source }, path, {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it reports a nested e2e/ directory, which is not the root lane', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree(
    { 'packages/kettle/e2e/kettle.test.ts': source },
    'packages/kettle/e2e/kettle.test.ts',
    { 'zgeoff/max-test-timeout': 'error' },
  );

  expect(result.stdout).toInclude('zgeoff(max-test-timeout)');
});

test('it exempts a lane the lanes option declares', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ 'kettle.sdk.test.ts': source }, 'kettle.sdk.test.ts', {
    'zgeoff/max-test-timeout': ['error', { lanes: ['sdk'] }],
  });

  expect(result.exitCode).toBe(0);
});

test('it reports a lane suffix that the lanes option does not declare', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ 'kettle.sdk.test.ts': source }, 'kettle.sdk.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('zgeoff(max-test-timeout)');
});

test('it keeps the built-in lanes when the lanes option declares more', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ 'kettle.host.test.ts': source }, 'kettle.host.test.ts', {
    'zgeoff/max-test-timeout': ['error', { lanes: ['sdk'] }],
  });

  expect(result.exitCode).toBe(0);
});
