import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  expect(result.stdout).toInclude('limit of the unit lane');
});

test('it names the timeout it reports', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude(
    'This timeout of 20000 ms is above the 5000 ms limit of the unit lane',
  );

  expect(result.stdout).toInclude('the "Slow tests" section of the testing skill');
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

test.each([
  ["runner.test('it brews', () => {}, 20_000);\n"],
  ["runner.test.skipIf(false)('it brews', () => {}, 20_000);\n"],
  ['runner.setDefaultTimeout(20_000);\n'],
])('it reports a timeout through a namespace import of bun:test: %s', async (body) => {
  const source = `import * as runner from 'bun:test';\n\n${body}`;

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
  ['e2e/kettle.test.ts', 15_000],
  ['e2e/helpers/preload.ts', 15_000],
  ['kettle.browser.test.ts', 10_000],
  ['kettle.browser.test.tsx', 10_000],
  ['kettle.docker.test.ts', 15_000],
  ['kettle.host.test.ts', 15_000],
  ['kettle.agent-sdk.test.ts', 5000],
  ['kettle.model-api.test.ts', 120_000],
  ['evals/kettle.model-api.test.ts', 120_000],
  ['e2e/kettle.model-api.test.ts', 120_000],
  ['e2e/kettle.browser.test.ts', 10_000],
  ['src/kettle.e2e.test.ts', 5000],
])(
  'it accepts a timeout at the limit of the lane file %s and reports one above it',
  async (path, limitMs) => {
    const atLimit = await runLintTree(
      { [path]: `import { test } from 'bun:test';\n\ntest('it brews', () => {}, ${limitMs});\n` },
      path,
      {
        'zgeoff/max-test-timeout': 'error',
      },
    );

    const aboveLimit = await runLintTree(
      {
        [path]: `import { test } from 'bun:test';\n\ntest('it brews', () => {}, ${limitMs + 1});\n`,
      },
      path,
      {
        'zgeoff/max-test-timeout': 'error',
      },
    );

    expect(atLimit.exitCode).toBe(0);
    expect(aboveLimit.stdout).toInclude(`above the ${limitMs} ms limit`);
  },
);

test('it reads setDefaultTimeout in a lane file against the lane limit', async () => {
  const source = "import { setDefaultTimeout } from 'bun:test';\n\nsetDefaultTimeout(30_000);\n";

  const result = await runLintTree({ 'e2e/preload.ts': source }, 'e2e/preload.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('above the 15000 ms limit of the e2e lane');
});

test('it reads an e2e/ directory beside an app root package.json as the e2e lane', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 15_000);\n";

  const result = await runLintTree(
    { 'packages/kettle/package.json': '{}', 'packages/kettle/e2e/kettle.test.ts': source },
    'packages/kettle/e2e/kettle.test.ts',
    { 'zgeoff/max-test-timeout': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it reads a package whose directory ends in -e2e as the e2e lane', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 15_000);\n";

  const result = await runLintTree(
    { 'apps/kettle-e2e/package.json': '{}', 'apps/kettle-e2e/src/brew.test.ts': source },
    'apps/kettle-e2e/src/brew.test.ts',
    { 'zgeoff/max-test-timeout': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test.each([
  ['an e2e/ directory outside an app root', 'packages/kettle/src/e2e/kettle.test.ts'],
  ['an evals/ directory, which runs in the unit run', 'evals/kettle.test.ts'],
  ['an app root evals/ directory', 'packages/kettle/evals/kettle.test.ts'],
  ['an integration/ directory, which runs in the unit run', 'integration/kettle.test.ts'],
])('it reads %s against the unit limit', async (_, path) => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 6000);\n";

  const result = await runLintTree({ 'packages/kettle/package.json': '{}', [path]: source }, path, {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('above the 5000 ms limit of the unit lane');
});

test('it reads the limit of a lane that the lanes option declares with one', async () => {
  const atLimit = await runLintTree(
    {
      'kettle.kvm.test.ts': `import { test } from 'bun:test';\n\ntest('it brews', () => {}, 60_000);\n`,
    },
    'kettle.kvm.test.ts',
    {
      'zgeoff/max-test-timeout': ['error', { lanes: { kvm: 60_000 } }],
    },
  );

  const aboveLimit = await runLintTree(
    {
      'kettle.kvm.test.ts': `import { test } from 'bun:test';\n\ntest('it brews', () => {}, 60_001);\n`,
    },
    'kettle.kvm.test.ts',
    { 'zgeoff/max-test-timeout': ['error', { lanes: { kvm: 60_000 } }] },
  );

  expect(atLimit.exitCode).toBe(0);
  expect(aboveLimit.stdout).toInclude('above the 60000 ms limit of the kvm lane');
});

test('it raises the limit of a standard lane that the lanes option names', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 60_000);\n";

  const result = await runLintTree({ 'e2e/kettle.test.ts': source }, 'e2e/kettle.test.ts', {
    'zgeoff/max-test-timeout': ['error', { lanes: { e2e: 60_000 } }],
  });

  expect(result.exitCode).toBe(0);
});

test('it gives a lane in the array form of the lanes option a 15 s limit', async () => {
  const atLimit = await runLintTree(
    {
      'kettle.sdk.test.ts': `import { test } from 'bun:test';\n\ntest('it brews', () => {}, 15_000);\n`,
    },
    'kettle.sdk.test.ts',
    {
      'zgeoff/max-test-timeout': ['error', { lanes: ['sdk'] }],
    },
  );

  const aboveLimit = await runLintTree(
    {
      'kettle.sdk.test.ts': `import { test } from 'bun:test';\n\ntest('it brews', () => {}, 15_001);\n`,
    },
    'kettle.sdk.test.ts',
    { 'zgeoff/max-test-timeout': ['error', { lanes: ['sdk'] }] },
  );

  expect(atLimit.exitCode).toBe(0);
  expect(aboveLimit.stdout).toInclude('above the 15000 ms limit of the sdk lane');
});

test('it reports a lane suffix that the lanes option does not declare', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 20_000);\n";

  const result = await runLintTree({ 'kettle.sdk.test.ts': source }, 'kettle.sdk.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('limit of the unit lane');
});

test('it keeps the standard lanes when the lanes option declares more', async () => {
  const source = "import { test } from 'bun:test';\n\ntest('it brews', () => {}, 15_000);\n";

  const result = await runLintTree({ 'kettle.host.test.ts': source }, 'kettle.host.test.ts', {
    'zgeoff/max-test-timeout': ['error', { lanes: { kvm: 60_000 } }],
  });

  expect(result.exitCode).toBe(0);
});

test('it honours a disable comment whose reason follows --', async () => {
  const source =
    "import { test } from 'bun:test';\n\n// oxlint-disable-next-line zgeoff/max-test-timeout -- 48 s on CI, OPS-212\ntest('it brews', { timeout: 60_000 }, () => {});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it reports the timeout on the line of an options object after the callback', async () => {
  const source = [
    "import { test } from 'bun:test';",
    '',
    'test(',
    "  'it restores',",
    '  async () => {},',
    '  { timeout: 60_000 },',
    ');',
    '',
  ].join('\n');

  const result = await runLintTree({ 'restore.test.ts': source }, 'restore.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('restore.test.ts:6:14');
});

test('it accepts the disable comment that the testing skill shows', async () => {
  const markdown = await readFile(
    join(import.meta.dir, '..', '..', 'sync', 'skills', 'testing', 'SKILL.md'),
    'utf8',
  );

  const example = /### A test over its limit\n[\s\S]*?```ts\n(?<code>[\s\S]*?)```/u.exec(markdown)
    ?.groups?.['code'];

  const result = await runLintTree(
    { 'restore.test.ts': `import { test } from 'bun:test';\n\n${example}` },
    'restore.test.ts',
    { 'zgeoff/max-test-timeout': 'error', 'zgeoff/test-timeout-exception-ticket': 'error' },
  );

  // bun:test types the options object only as the last argument, after the callback
  expect(example).toMatch(
    /\},\n +\/\/ oxlint-disable-next-line [^\n]+\n +\{ timeout: [\d_]+ \},\n\);\n$/u,
  );

  expect(result.stdout).not.toInclude('zgeoff(');
  expect(result.exitCode).toBe(0);
});

test('it holds the same lane limits as the Lanes table in the shared testing skill', async () => {
  const markdown = await readFile(
    join(import.meta.dir, '..', '..', 'sync', 'skills', 'testing', 'SKILL.md'),
    'utf8',
  );

  const rows = [
    ...markdown.matchAll(/^\| (?<lane>[a-z0-9-]+) +\| [^|]+\| (?<seconds>\d+) s +\|/gmu),
  ].map((match) => ({
    lane: match.groups?.['lane'] ?? '',
    limitMs: Number(match.groups?.['seconds']) * 1000,
  }));

  const paths = new Map([
    ['unit', 'kettle.test.ts'],
    ['e2e', 'e2e/kettle.test.ts'],
  ]);

  const toFiles = (extraMs: number) =>
    Object.fromEntries(
      rows.map((row) => [
        paths.get(row.lane) ?? `kettle.${row.lane}.test.ts`,
        `import { test } from 'bun:test';\n\ntest('it brews', () => {}, ${row.limitMs + extraMs});\n`,
      ]),
    );

  const atLimit = await runLintTree(toFiles(0), '.', { 'zgeoff/max-test-timeout': 'error' });
  const aboveLimit = await runLintTree(toFiles(1), '.', { 'zgeoff/max-test-timeout': 'error' });

  const reported = [...aboveLimit.stdout.matchAll(/limit of the (?<lane>[a-z0-9-]+) lane/gu)].map(
    (match) => match.groups?.['lane'],
  );

  expect(rows.length).toBe(7);
  expect(atLimit.exitCode).toBe(0);
  expect(reported).toIncludeSameMembers(rows.map((row) => row.lane));
});
