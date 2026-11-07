import { expect, test } from 'bun:test';
import { runLintTree } from './src/test-utils/run-lint-tree.ts';

test.each([
  ['a seed with no test', {}],
  ['a seed beside only the test of another seed', { 'src/test-utils/seed-kettle-lid.test.ts': '' }],
  ['a seed whose test sits in another folder', { 'src/seed-kettle.test.ts': '' }],
])('it reports %s', async (_, otherFiles: Readonly<Record<string, string>>) => {
  const result = await runLintTree(
    { ...otherFiles, 'src/test-utils/seed-kettle.ts': 'export function seedKettle(): void {}\n' },
    'src/test-utils/seed-kettle.ts',
    { 'zgeoff/test-beside-seed': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(test-beside-seed)');
  expect(result.stdout).toInclude('Write `seed-kettle.test.ts` beside this seed');
});

test.each([
  ['a test beside it', 'seed-kettle.test.ts'],
  ['a .tsx test beside it', 'seed-kettle.test.tsx'],
  ['a lane suite beside it', 'seed-kettle.host.test.ts'],
])('it accepts a seed with %s', async (_, testName) => {
  const result = await runLintTree(
    {
      [`src/test-utils/${testName}`]: '',
      'src/test-utils/seed-kettle.ts': 'export function seedKettle(): void {}\n',
    },
    'src/test-utils/seed-kettle.ts',
    { 'zgeoff/test-beside-seed': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test.each([
  ['a test of a seed', 'src/test-utils/seed-kettle.test.ts'],
  ['a declaration file', 'src/test-utils/seed-kettle.d.ts'],
  ['a module whose name only starts with seed', 'src/seedling.ts'],
])('it leaves %s alone', async (_, path) => {
  const result = await runLintTree({ [path]: 'export const kettle = 1;\n' }, path, {
    'zgeoff/test-beside-seed': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it honours a file-level disable comment', async () => {
  const source =
    '// oxlint-disable zgeoff/test-beside-seed -- the seed of a removed table, kept for one release\nexport function seedKettle(): void {}\n';

  const result = await runLintTree(
    { 'src/test-utils/seed-kettle.ts': source },
    'src/test-utils/seed-kettle.ts',
    { 'zgeoff/test-beside-seed': 'error' },
  );

  expect(result.exitCode).toBe(0);
});
