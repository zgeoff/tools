import { expect, test } from 'bun:test';
import { createLintTree } from './src/test-utils/create-lint-tree.ts';
import { runLintMessages } from './src/test-utils/run-lint-messages.ts';

test('it gives the first loose module over the cap the example tree, and the others line one', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/apply-discount.ts': 'export {};\n',
      'packages/api/src/charge-card.ts': 'export {};\n',
      'packages/api/src/create-invoice.ts': 'export {};\n',
      'packages/api/src/format-total.ts': 'export {};\n',
      'packages/api/src/parse-order.ts': 'export {};\n',
      'packages/api/src/read-config.ts': 'export {};\n',
      'packages/api/src/refund-payment.ts': 'export {};\n',
      'packages/api/src/send-receipt.ts': 'export {};\n',
      'packages/api/src/to-cents.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/api/src/apply-discount.ts',
    'packages/api/src/to-cents.ts',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: 'packages/api/src/apply-discount.ts',
      line: 1,
      message: [
        'packages/api/src/ holds 9 loose modules, and the limit is 8. Group them into one folder per thing the package does:',
        '',
        '  src/',
        '    index.ts  cli.ts        index.ts, types.ts, constants.ts and the files package.json names stay',
        '    invoices/               create-invoice.ts  format-invoice-total.ts',
        '    payments/               charge-card.ts  refund-payment.ts',
        '    utils/                  to-cents.ts         code that several folders share',
      ].join('\n'),
    },
    {
      filename: 'packages/api/src/to-cents.ts',
      line: 1,
      message:
        'packages/api/src/ holds 9 loose modules, and the limit is 8. Group them into one folder per thing the package does:',
    },
  ]);
});

test('it accepts a root of 8 loose modules', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/apply-discount.ts': 'export {};\n',
      'packages/api/src/charge-card.ts': 'export {};\n',
      'packages/api/src/create-invoice.ts': 'export {};\n',
      'packages/api/src/format-total.ts': 'export {};\n',
      'packages/api/src/parse-order.ts': 'export {};\n',
      'packages/api/src/read-config.ts': 'export {};\n',
      'packages/api/src/refund-payment.ts': 'export {};\n',
      'packages/api/src/send-receipt.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/api/src/apply-discount.ts',
  ]);

  expect(messages).toStrictEqual([]);
});

test.each([
  ['index.ts', { 'packages/api/src/index.ts': 'export {};\n' }, '{ "name": "api" }'],
  ['types.ts', { 'packages/api/src/types.ts': 'export {};\n' }, '{ "name": "api" }'],
  ['constants.ts', { 'packages/api/src/constants.ts': 'export {};\n' }, '{ "name": "api" }'],
  ['a .test.ts file', { 'packages/api/src/to-cents.test.ts': 'export {};\n' }, '{ "name": "api" }'],
  [
    'a .browser.test.tsx file',
    { 'packages/api/src/view.browser.test.tsx': 'export {};\n' },
    '{ "name": "api" }',
  ],
  [
    'a .bench.ts file',
    { 'packages/api/src/to-cents.bench.ts': 'export {};\n' },
    '{ "name": "api" }',
  ],
  ['a .spec.ts file', { 'packages/api/src/to-cents.spec.ts': 'export {};\n' }, '{ "name": "api" }'],
  ['a declaration file', { 'packages/api/src/globals.d.ts': 'export {};\n' }, '{ "name": "api" }'],
  [
    'a file that is not a module',
    { 'packages/api/src/schema.sql': 'export {};\n' },
    '{ "name": "api" }',
  ],
  [
    'a test-utils/ folder',
    { 'packages/api/src/test-utils/start-api.ts': 'export {};\n' },
    '{ "name": "api" }',
  ],
  [
    'a generated/ folder',
    { 'packages/api/src/generated/schema.ts': 'export {};\n' },
    '{ "name": "api" }',
  ],
  [
    'the main file',
    { 'packages/api/src/serve.ts': 'export {};\n' },
    '{ "name": "api", "main": "./src/serve.ts" }',
  ],
  [
    'the module file',
    { 'packages/api/src/serve.ts': 'export {};\n' },
    '{ "name": "api", "module": "src/serve.ts" }',
  ],
  [
    'a bin file',
    { 'packages/api/src/cli.ts': 'export {};\n' },
    '{ "name": "api", "bin": { "api": "./src/cli.ts" } }',
  ],
  [
    'an exports condition target',
    { 'packages/api/src/serve.ts': 'export {};\n' },
    '{ "name": "api", "exports": { "./serve": { "types": "./dist/serve.d.ts", "bun": "./src/serve.ts" } } }',
  ],
  [
    'a file a script names',
    { 'packages/api/src/serve.ts': 'export {};\n' },
    '{ "name": "api", "scripts": { "start": "bun run src/serve.ts --port=3000" } }',
  ],
])('it does not count %s', async (_, extra, manifest) => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': manifest,
      'packages/api/src/apply-discount.ts': 'export {};\n',
      'packages/api/src/charge-card.ts': 'export {};\n',
      'packages/api/src/create-invoice.ts': 'export {};\n',
      'packages/api/src/format-total.ts': 'export {};\n',
      'packages/api/src/parse-order.ts': 'export {};\n',
      'packages/api/src/read-config.ts': 'export {};\n',
      'packages/api/src/refund-payment.ts': 'export {};\n',
      'packages/api/src/send-receipt.ts': 'export {};\n',
      ...extra,
    },
    { 'zgeoff/feature-folders': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', ['packages/api']);

  expect(messages).toStrictEqual([]);
});

test('it counts a file that only a wildcard exports target names', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api", "exports": { "./*": "./src/*.ts" } }',
      'packages/api/src/apply-discount.ts': 'export {};\n',
      'packages/api/src/charge-card.ts': 'export {};\n',
      'packages/api/src/create-invoice.ts': 'export {};\n',
      'packages/api/src/format-total.ts': 'export {};\n',
      'packages/api/src/parse-order.ts': 'export {};\n',
      'packages/api/src/read-config.ts': 'export {};\n',
      'packages/api/src/refund-payment.ts': 'export {};\n',
      'packages/api/src/send-receipt.ts': 'export {};\n',
      'packages/api/src/to-cents.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/api/src/to-cents.ts',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: 'packages/api/src/to-cents.ts',
      line: 1,
      message:
        'packages/api/src/ holds 9 loose modules, and the limit is 8. Group them into one folder per thing the package does:',
    },
  ]);
});

test('it leaves the files in a feature folder and the exempt root files unreported', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/index.ts': 'export {};\n',
      'packages/api/src/payments/charge-card.ts': 'export {};\n',
      'packages/api/src/apply-discount.ts': 'export {};\n',
      'packages/api/src/create-invoice.ts': 'export {};\n',
      'packages/api/src/format-total.ts': 'export {};\n',
      'packages/api/src/parse-order.ts': 'export {};\n',
      'packages/api/src/read-config.ts': 'export {};\n',
      'packages/api/src/refund-payment.ts': 'export {};\n',
      'packages/api/src/send-receipt.ts': 'export {};\n',
      'packages/api/src/to-cents.ts': 'export {};\n',
      'packages/api/src/to-percent.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/api/src/index.ts',
    'packages/api/src/payments/charge-card.ts',
  ]);

  expect(messages).toStrictEqual([]);
});

test.each(['lib', 'shared', 'helpers', 'common'])(
  'it tells a file in src/%s/ to rename the folder to src/utils/',
  async (folder) => {
    const directory = await createLintTree(
      {
        'packages/api/package.json': '{ "name": "api" }',
        [`packages/api/src/${folder}/money/to-cents.ts`]: 'export {};\n',
      },
      { 'zgeoff/feature-folders': 'error' },
    );

    const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
      `packages/api/src/${folder}/money/to-cents.ts`,
    ]);

    expect(messages).toStrictEqual([
      {
        filename: `packages/api/src/${folder}/money/to-cents.ts`,
        line: 1,
        message: `packages/api/src/${folder}/ is a shared folder under another name; rename it to src/utils/.`,
      },
    ]);
  },
);

test('it accepts a synonym name below a feature folder', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/payments/lib/to-cents.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/api/src/payments/lib/to-cents.ts',
  ]);

  expect(messages).toStrictEqual([]);
});

test.each([
  ['an import', "import { chargeCard } from '../payments/charge-card.ts';\n"],
  ['a re-export', "export { chargeCard } from '../payments/charge-card.ts';\n"],
  ['an export-all', "export * from '../payments/charge-card.ts';\n"],
  ['a dynamic import', "await import('../payments/charge-card.ts');\n"],
  ['an extensionless import', "import { chargeCard } from '../payments/charge-card';\n"],
])('it reports %s from utils/ into a feature folder', async (_, source) => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/utils/to-cents.ts': source,
      'packages/api/src/payments/charge-card.ts': 'export function chargeCard(): void {}\n',
    },
    { 'zgeoff/feature-folders': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/api/src/utils/to-cents.ts',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: 'packages/api/src/utils/to-cents.ts',
      line: 1,
      message:
        'packages/api/src/utils/to-cents.ts imports src/payments/charge-card.ts, and utils/ sits below every feature folder. Move charge-card.ts into utils/, or move to-cents.ts into payments/.',
    },
  ]);
});

test.each([
  ['another utils/ file', "import { round } from './round.ts';\n"],
  ['a loose root module', "import { readConfig } from '../read-config.ts';\n"],
  ['a generated/ file', "import { schema } from '../generated/schema.ts';\n"],
  ['a package', "import { join } from 'node:path';\n"],
])('it accepts an import from utils/ of %s', async (_, source) => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/utils/to-cents.ts': source,
      'packages/api/src/utils/round.ts': 'export {};\n',
      'packages/api/src/read-config.ts': 'export {};\n',
      'packages/api/src/generated/schema.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': 'error' },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/api/src/utils/to-cents.ts',
  ]);

  expect(messages).toStrictEqual([]);
});

test('it skips every check in a package that pending lists', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/apply-discount.ts': 'export {};\n',
      'packages/api/src/charge-card.ts': 'export {};\n',
      'packages/api/src/create-invoice.ts': 'export {};\n',
      'packages/api/src/format-total.ts': 'export {};\n',
      'packages/api/src/parse-order.ts': 'export {};\n',
      'packages/api/src/read-config.ts': 'export {};\n',
      'packages/api/src/refund-payment.ts': 'export {};\n',
      'packages/api/src/send-receipt.ts': 'export {};\n',
      'packages/api/src/to-cents.ts': 'export {};\n',
      'packages/api/src/lib/round.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': ['error', { pending: ['packages/api'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', ['packages/api']);

  expect(messages).toStrictEqual([]);
});

test.each([
  ['a root over the cap', { 'packages/api/src/to-cents.ts': 'export {};\n' }],
  ['a synonym folder', { 'packages/api/src/lib/round.ts': 'export {};\n' }],
  [
    'a utils/ import of a feature folder',
    {
      'packages/api/src/utils/round.ts':
        "import { chargeCard } from '../payments/charge-card.ts';\n",
      'packages/api/src/payments/charge-card.ts': 'export {};\n',
    },
  ],
])('it keeps a pending entry whose package still has %s', async (_, extra) => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/apply-discount.ts': 'export {};\n',
      'packages/api/src/charge-card.ts': 'export {};\n',
      'packages/api/src/create-invoice.ts': 'export {};\n',
      'packages/api/src/format-total.ts': 'export {};\n',
      'packages/api/src/parse-order.ts': 'export {};\n',
      'packages/api/src/read-config.ts': 'export {};\n',
      'packages/api/src/refund-payment.ts': 'export {};\n',
      'packages/api/src/send-receipt.ts': 'export {};\n',
      'packages/web/package.json': '{ "name": "web" }',
      'packages/web/src/index.ts': 'export {};\n',
      ...extra,
    },
    { 'zgeoff/feature-folders': ['error', { pending: ['packages/api'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/web/src/index.ts',
  ]);

  expect(messages).toStrictEqual([]);
});

test('it reports a pending entry whose package passes', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/index.ts': 'export {};\n',
      'packages/api/src/payments/charge-card.ts': 'export {};\n',
      'packages/web/package.json': '{ "name": "web" }',
      'packages/web/src/index.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': ['error', { pending: ['./packages/api/'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/web/src/index.ts',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: 'packages/web/src/index.ts',
      line: 1,
      message:
        '`packages/api` in the `pending` option of zgeoff/feature-folders now passes the rule; remove it from `pending`.',
    },
  ]);
});

test('it reports a pending entry that names no package', async () => {
  const directory = await createLintTree(
    {
      'packages/web/package.json': '{ "name": "web" }',
      'packages/web/src/index.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': ['error', { pending: ['packages/billing'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', [
    'packages/web/src/index.ts',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: 'packages/web/src/index.ts',
      line: 1,
      message:
        '`packages/billing` in the `pending` option of zgeoff/feature-folders names no package; remove it from `pending`.',
    },
  ]);
});

test('it reports a stale pending entry on one file of the run', async () => {
  const directory = await createLintTree(
    {
      'packages/web/package.json': '{ "name": "web" }',
      'packages/web/src/index.ts': 'export {};\n',
      'packages/web/src/types.ts': 'export {};\n',
    },
    { 'zgeoff/feature-folders': ['error', { pending: ['packages/billing'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/feature-folders', ['packages/web']);

  expect(messages).toHaveLength(1);
});
