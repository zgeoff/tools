import { expect, test } from 'bun:test';
import { runLintTree } from './test-utils/run-lint-tree.ts';

test.each([
  [
    'a describe block',
    "import { describe, test } from 'bun:test';\n\ndescribe('kettle', () => {\n  test('it boils', () => {});\n});\n",
    'top-level `test()` call; `describe` is banned',
  ],
  [
    'a describe.each block',
    "import { describe, test } from 'bun:test';\n\ndescribe.each([1, 2])('kettle %d', () => {\n  test('it boils', () => {});\n});\n",
    'top-level `test()` call; `describe` is banned',
  ],
  [
    'an it call',
    "import { it } from 'bun:test';\n\nit('boils', () => {});\n",
    '`it`, the alias Bun gives `test`, is banned',
  ],
  [
    'an it.skip call',
    "import { it } from 'bun:test';\n\nit.skip('boils', () => {});\n",
    '`it`, the alias Bun gives `test`, is banned',
  ],
  [
    'a beforeAll hook',
    "import { beforeAll, test } from 'bun:test';\n\nbeforeAll(() => {});\n\ntest('it boils', () => {});\n",
    '`beforeAll` is banned',
  ],
  [
    'a beforeEach hook',
    "import { beforeEach, test } from 'bun:test';\n\nbeforeEach(() => {});\n\ntest('it boils', () => {});\n",
    '`beforeEach` is banned',
  ],
  [
    'an afterAll hook',
    "import { afterAll, test } from 'bun:test';\n\nafterAll(() => {});\n\ntest('it boils', () => {});\n",
    '`afterAll` is banned',
  ],
  [
    'an afterEach hook',
    "import { afterEach, test } from 'bun:test';\n\nafterEach(() => {});\n\ntest('it boils', () => {});\n",
    '`afterEach` is banned',
  ],
  [
    'an aliased bun:test import',
    "import { test as check } from 'bun:test';\n\ncheck('it boils', () => {});\n",
    'by its own name',
  ],
  [
    'a namespace bun:test import',
    "import * as runner from 'bun:test';\n\nrunner.test('it boils', () => {});\n",
    'by its own name',
  ],
  [
    'a describe.only.each block',
    "import { describe, test } from 'bun:test';\n\ndescribe.only.each([1])('kettle %d', () => {\n  test('it boils', () => {});\n});\n",
    'top-level `test()` call; `describe` is banned',
  ],
  [
    'a toEqual matcher',
    "import { expect, test } from 'bun:test';\n\ntest('it boils', () => {\n  expect({ cups: 2 }).toEqual({ cups: 2 });\n});\n",
    '`toEqual` is banned',
  ],
  [
    'a negated toEqual matcher',
    "import { expect, test } from 'bun:test';\n\ntest('it boils', () => {\n  expect({ cups: 2 }).not.toEqual({ cups: 3 });\n});\n",
    '`toEqual` is banned',
  ],
  [
    'a title with no it or unit prefix',
    "import { test } from 'bun:test';\n\ntest('boils water', () => {});\n",
    'Start a test title with `it `',
  ],
  [
    'a template title with no prefix',
    `import { test } from 'bun:test';\n\ntest(\`boils \${'water'}\`, () => {});\n`,
    'Start a test title with `it `',
  ],
  [
    'a test.skip title with no prefix',
    "import { test } from 'bun:test';\n\ntest.skip('boils water', () => {});\n",
    'Start a test title with `it `',
  ],
  [
    'a test.each title with no prefix',
    "import { test } from 'bun:test';\n\ntest.each([1, 2])('%d cups boil', () => {});\n",
    'Start a test title with `it `',
  ],
  [
    'a test.concurrent.each title with no prefix',
    "import { test } from 'bun:test';\n\ntest.concurrent.each([1, 2])('%d cups boil', () => {});\n",
    'Start a test title with `it `',
  ],
  [
    'a test.skip.each title with no prefix',
    "import { test } from 'bun:test';\n\ntest.skip.each([1, 2])('%d cups boil', () => {});\n",
    'Start a test title with `it `',
  ],
  [
    'a test.skipIf(…).each title with no prefix',
    "import { test } from 'bun:test';\n\ntest.skipIf(false).each([1, 2])('%d cups boil', () => {});\n",
    'Start a test title with `it `',
  ],
  [
    'a unit prefix with no space after it',
    "import { test } from 'bun:test';\n\ntest('#brew', () => {});\n",
    'Start a test title with `it `',
  ],
])('it reports %s', async (_, source, message) => {
  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/test-shape': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(test-shape)');
  expect(result.stdout).toInclude(message);
});

test.each([
  ['an it title', "test('it boils water', () => {});\n"],
  ['a unit title', "test('#brew pours two cups', () => {});\n"],
  ['a dotted unit title', "test('#kettle.brew pours two cups', () => {});\n"],
  ['a template title with a prefix', `test(\`it boils \${'water'}\`, () => {});\n`],
  ['a test.each title with a prefix', "test.each([1, 2])('it boils %d cups', () => {});\n"],
  ['a test.skipIf title with a prefix', "test.skipIf(false)('it boils water', () => {});\n"],
  ['a title held in a variable', "const title = 'boils';\n\ntest(title, () => {});\n"],
  [
    'a toStrictEqual matcher',
    "test('it boils', () => {\n  expect({ cups: 2 }).toStrictEqual({ cups: 2 });\n});\n",
  ],
  [
    'a toMatchObject matcher',
    "test('it boils', () => {\n  expect({ cups: 2 }).toMatchObject({ cups: 2 });\n});\n",
  ],
])('it accepts %s', async (_, body) => {
  const source = `import { expect, test } from 'bun:test';\n\n${body}`;

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/test-shape': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each([
  [
    'a test file of another runner',
    'kettle.test.ts',
    "import { describe, expect, it } from 'vitest';\n\ndescribe('kettle', () => {\n  it('boils', () => {\n    expect(2).toEqual(2);\n  });\n});\n",
  ],
  [
    'a test file with a type-only bun:test import',
    'kettle.test.ts',
    "import type { Mock } from 'bun:test';\n\ndescribe('kettle', () => {});\n\nexport type Pot = Mock<() => void>;\n",
  ],
  [
    'a test file whose bun:test import holds only inline type specifiers',
    'kettle.test.ts',
    "import { type Mock } from 'bun:test';\nimport { describe, it } from 'vitest';\n\ndescribe('kettle', () => {\n  it('boils', () => {});\n});\n\nexport type Pot = Mock<() => void>;\n",
  ],
  [
    'a module that is not a test file',
    'kettle.ts',
    "import { expect } from 'bun:test';\n\nexport function checkPot(cups: number) {\n  expect(cups).toEqual(2);\n}\n",
  ],
])('it leaves alone %s', async (_, fileName, source) => {
  const result = await runLintTree({ [fileName]: source }, fileName, {
    'zgeoff/test-shape': 'error',
  });

  expect(result.stdout).not.toInclude('zgeoff(test-shape)');
});

test.each([
  ['describe', "describe('kettle', () => {});\n"],
  ['describe.each', "describe.each([1])('kettle %d', () => {});\n"],
  ['it', "it('boils', () => {});\n"],
  ['beforeEach', 'beforeEach(() => {});\n'],
])(
  'it leaves a module-level %s in a bun:test file to test-shape alone',
  async (name, statement) => {
    const [root] = name.split('.');
    const source = `import { ${root}, test } from 'bun:test';\n\n${statement}\ntest('it boils', () => {});\n`;

    const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
      'zgeoff/test-shape': 'error',
      'zgeoff/setup-test-only': 'error',
    });

    expect(result.stdout.split('zgeoff(test-shape)')).toHaveLength(2);
    expect(result.stdout).not.toInclude('zgeoff(setup-test-only)');
  },
);

test('it leaves setup-test-only to report a module-level describe in a mod check file', async () => {
  const source =
    "import { describe, test } from 'claude-code/testing';\n\ndescribe('kettle', () => {});\n\ntest('it boils', () => {});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/test-shape': 'error',
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout).toInclude('zgeoff(setup-test-only)');
  expect(result.stdout).not.toInclude('zgeoff(test-shape)');
});
