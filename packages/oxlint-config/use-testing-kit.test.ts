import { expect, test } from 'bun:test';
import type { FileTree } from './src/test-utils/create-lint-tree.ts';
import { runLintTree } from './src/test-utils/run-lint-tree.ts';

function setupTest() {
  const rules = { 'zgeoff/use-testing-kit': 'error' };

  const stubKit: FileTree = {
    'node_modules/@zgeoff/testing/package.json': JSON.stringify({
      name: '@zgeoff/testing',
      exports: {
        '.': { types: './dist/index.d.ts', default: './src/index.ts' },
        './fetch': { default: './src/fetch/index.ts' },
      },
    }),
    'node_modules/@zgeoff/testing/src/index.ts':
      "export { waitFor } from './core/wait-for.ts';\nexport { run } from './core/run.ts';\nexport type { WaitForOptions } from './core/wait-for.ts';\n",
    'node_modules/@zgeoff/testing/src/core/wait-for.ts': 'export function waitFor() {}\n',
    'node_modules/@zgeoff/testing/src/fetch/index.ts':
      "export * from './create-test-network.ts';\n",
    'node_modules/@zgeoff/testing/src/fetch/create-test-network.ts':
      'export function createTestNetwork() {}\nexport type TestNetwork = object;\n',
    'package.json': '{"name":"app"}',
  };

  return { rules, stubKit };
}

test('it reports a kit export declared in a test-utils folder', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    { ...ctx.stubKit, 'src/test-utils/wait-for.ts': 'export function waitFor() {}\n' },
    'src/test-utils/wait-for.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(use-testing-kit)');
  expect(result.stdout).toInclude('waitFor is exported by @zgeoff/testing; import it from there');
});

test('it reports a kit export declared in a test file', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    { ...ctx.stubKit, 'src/kettle.test.ts': 'function waitFor() {}\n\nexport { waitFor };\n' },
    'src/kettle.test.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('waitFor is exported by @zgeoff/testing');
});

test('it reports a kit export held in a function-valued const', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    { ...ctx.stubKit, 'src/test-utils/wait-for.ts': 'export const waitFor = () => {};\n' },
    'src/test-utils/wait-for.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(1);
});

test('it names the subpath that exports the function', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    {
      ...ctx.stubKit,
      'src/test-utils/create-test-network.ts': 'export function createTestNetwork() {}\n',
    },
    'src/test-utils/create-test-network.ts',
    ctx.rules,
  );

  expect(result.stdout).toInclude('createTestNetwork is exported by @zgeoff/testing/fetch');
});

test('it accepts a function in a plain module with a kit name', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    { ...ctx.stubKit, 'src/wait-for.ts': 'export function waitFor() {}\n' },
    'src/wait-for.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(0);
});

test('it accepts a function whose name is not a kit export', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    { ...ctx.stubKit, 'src/test-utils/wait-for-boil.ts': 'export function waitForBoil() {}\n' },
    'src/test-utils/wait-for-boil.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(0);
});

test('it skips a kit export with no capital letter', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    { ...ctx.stubKit, 'src/test-utils/run.ts': 'export function run() {}\n' },
    'src/test-utils/run.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(0);
});

test('it skips a kit type export', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    { ...ctx.stubKit, 'src/test-utils/options.ts': 'export function WaitForOptions() {}\n' },
    'src/test-utils/options.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(0);
});

test('it reports nothing when the kit is not installed', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    {
      'package.json': '{"name":"app"}',
      'src/test-utils/wait-for.ts':
        "import { setupServer } from 'msw/node';\n\nexport function waitFor() {\n  return setupServer;\n}\n",
    },
    'src/test-utils/wait-for.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(0);
});

test('it never flags the source of the kit package', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    {
      ...ctx.stubKit,
      'package.json': '{"name":"@zgeoff/testing"}',
      'src/test-utils/wait-for.ts':
        "import { setupServer } from 'msw/node';\n\nexport function waitFor() {\n  return setupServer;\n}\n",
    },
    'src/test-utils/wait-for.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(0);
});

test('it reports an import of setupServer from msw/node', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    {
      ...ctx.stubKit,
      'src/server.ts':
        "import { setupServer } from 'msw/node';\n\nexport const server = setupServer;\n",
    },
    'src/server.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('use `createTestNetwork` from `@zgeoff/testing/fetch`');
});

test('it reports an import of setupServer under another local name', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    {
      ...ctx.stubKit,
      'src/server.ts':
        "import { setupServer as start } from 'msw/node';\n\nexport const server = start;\n",
    },
    'src/server.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(1);
});

test('it accepts another import from msw/node', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    {
      ...ctx.stubKit,
      'src/server.ts': "import { http } from 'msw/node';\n\nexport const handler = http;\n",
    },
    'src/server.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(0);
});

test('it reports an import of @mswjs/interceptors/fetch', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    {
      ...ctx.stubKit,
      'src/intercept.ts':
        "import { FetchInterceptor } from '@mswjs/interceptors/fetch';\n\nexport const interceptor = FetchInterceptor;\n",
    },
    'src/intercept.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('use `createTestNetwork` from `@zgeoff/testing/fetch`');
});

test('it accepts an import of the interceptors package root', async () => {
  const ctx = setupTest();

  const result = await runLintTree(
    {
      ...ctx.stubKit,
      'src/intercept.ts':
        "import { BatchInterceptor } from '@mswjs/interceptors';\n\nexport const interceptor = BatchInterceptor;\n",
    },
    'src/intercept.ts',
    ctx.rules,
  );

  expect(result.exitCode).toBe(0);
});
