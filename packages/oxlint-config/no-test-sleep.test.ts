import { expect, test } from 'bun:test';
import { runLintTree } from './test-utils/run-lint-tree.ts';

test.each([
  ['Bun.sleep', "test('it brews', async () => {\n  await Bun.sleep(50);\n});\n"],
  ['Bun.sleepSync', "test('it brews', () => {\n  Bun.sleepSync(50);\n});\n"],
  [
    'a setTimeout in a new Promise',
    "test('it brews', async () => {\n  await new Promise((resolve) => setTimeout(resolve, 50));\n});\n",
  ],
  [
    'a globalThis.setTimeout in a new Promise',
    "test('it brews', async () => {\n  await new Promise((resolve) => {\n    globalThis.setTimeout(resolve, 50);\n  });\n});\n",
  ],
  [
    'the setTimeout of node:timers/promises',
    "import { setTimeout as sleep } from 'node:timers/promises';\n\ntest('it brews', async () => {\n  await sleep(50);\n});\n",
  ],
  [
    'the setTimeout of a timers/promises namespace',
    "import * as timers from 'node:timers/promises';\n\ntest('it brews', async () => {\n  await timers.setTimeout(50);\n});\n",
  ],
  [
    'a sleep in a helper whose name is not a wait helper',
    "test('it brews', async () => {\n  const pause = () => Bun.sleep(50);\n\n  await pause();\n});\n",
  ],
])('it reports %s in a test file', async (_, body) => {
  const source = `import { test } from 'bun:test';\n${body}`;

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/no-test-sleep': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(no-test-sleep)');
  expect(result.stdout).toInclude('inside a wait helper named `waitFor…` or `waitUntil…`');
});

test.each([
  [
    'a sleep inside a waitFor helper',
    "test('it brews', async () => {\n  const waitForBoil = async (isBoiling: () => boolean) => {\n    while (!isBoiling()) {\n      await Bun.sleep(10);\n    }\n  };\n\n  await waitForBoil(() => true);\n});\n",
  ],
  [
    'a wrapped setTimeout inside a waitUntil method',
    "async function setupTest() {\n  return {\n    async waitUntilIdle() {\n      await new Promise((resolve) => setTimeout(resolve, 10));\n    },\n  };\n}\n\ntest('it brews', async () => {\n  const ctx = await setupTest();\n\n  await ctx.waitUntilIdle();\n});\n",
  ],
  [
    'a setTimeout outside a promise',
    "test('it brews', () => {\n  const timer = setTimeout(() => {}, 10);\n\n  clearTimeout(timer);\n});\n",
  ],
  [
    'a setInterval from node:timers/promises',
    "import { setInterval } from 'node:timers/promises';\n\ntest('it brews', () => {\n  expect(setInterval).toBeFunction();\n});\n",
  ],
])('it accepts %s', async (_, body) => {
  const source = `import { expect, test } from 'bun:test';\n${body}`;

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/no-test-sleep': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it reports a sleep in a lane suite, which keeps the wait rule', async () => {
  const source =
    "import { test } from 'bun:test';\n\ntest('it brews', async () => {\n  await Bun.sleep(50);\n});\n";

  const result = await runLintTree({ 'kettle.browser.test.ts': source }, 'kettle.browser.test.ts', {
    'zgeoff/no-test-sleep': 'error',
  });

  expect(result.stdout).toInclude('zgeoff(no-test-sleep)');
});

test('it accepts a sleep in a file that is not a test file', async () => {
  const result = await runLintTree(
    { 'kettle.ts': 'export async function runBrew() {\n  await Bun.sleep(50);\n}\n' },
    'kettle.ts',
    { 'zgeoff/no-test-sleep': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it reads a wait helper name only at a camelCase boundary', async () => {
  const source =
    "import { test } from 'bun:test';\n\ntest('it brews', async () => {\n  const waitForward = () => Bun.sleep(50);\n\n  await waitForward();\n});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/no-test-sleep': 'error',
  });

  expect(result.stdout).toInclude('zgeoff(no-test-sleep)');
});
