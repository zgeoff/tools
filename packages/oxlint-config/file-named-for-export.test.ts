import { expect, test } from 'bun:test';
import { createLintTree } from './src/test-utils/create-lint-tree.ts';
import { runLintMessages } from './src/test-utils/run-lint-messages.ts';
import { runLintTree } from './src/test-utils/run-lint-tree.ts';

test.each([
  ['an export with another name', 'export function boilKettle(): void {}\n'],
  [
    'a default export with another name',
    'function boilKettle(): void {}\n\nexport default boilKettle;\n',
  ],
  [
    'an export whose name only starts with the file name',
    'export function pourKettleTwice(): void {}\n',
  ],
  ['an anonymous default export', 'export default { cups: 2 };\n'],
  [
    'a default export with another name under satisfies',
    'const boilKettle = { cups: 2 };\n\nexport default boilKettle satisfies object;\n',
  ],
])('it reports a file with %s', async (_, source) => {
  const result = await runLintTree({ 'src/pour-kettle.ts': source }, 'src/pour-kettle.ts', {
    'zgeoff/file-named-for-export': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(file-named-for-export)');
  expect(result.stdout).toInclude("No export of 'pour-kettle.ts' is named for the file");
});

test.each([
  ['a file named for a function', 'src/pour-kettle.ts', 'export function pourKettle(): void {}\n'],
  [
    'a file named for a name that differs only in case',
    'src/parse-cli-args.ts',
    'export function parseCLIArgs(): void {}\n',
  ],
  ['a file named for a type', 'src/kettle-state.ts', "export type KettleState = 'cold' | 'hot';\n"],
  [
    'a file named for an interface',
    'src/kettle-state.ts',
    'export interface KettleState {\n  readonly cups: number;\n}\n',
  ],
  [
    'a file named for a SCREAMING_SNAKE_CASE const',
    'src/max-kettles.ts',
    'export const MAX_KETTLES = 4;\n',
  ],
  [
    'a file named for a named default export',
    'src/pour-kettle.ts',
    'export default function pourKettle(): void {}\n',
  ],
  [
    'a file named for a default export of an identifier',
    'src/pour-kettle.ts',
    'const pourKettle = { cups: 2 };\n\nexport default pourKettle;\n',
  ],
  [
    'a file named for one export among several',
    'src/pour-kettle.ts',
    'export const kettleCups = 2;\n\nexport function pourKettle(): void {}\n',
  ],
  [
    'a file named for a destructured const',
    'src/pour-kettle.ts',
    'const kettle = { pourKettle: 1 };\n\nexport const { pourKettle } = kettle;\n',
  ],
  [
    'a file named for a re-export under the file name',
    'src/pour-kettle.ts',
    "export { boilKettle as pourKettle } from './boil-kettle.ts';\n",
  ],
  [
    'a file named for a component in a .tsx file',
    'src/kettle-card.tsx',
    'export function KettleCard(): null {\n  return null;\n}\n',
  ],
  [
    'a file named for a default export under satisfies',
    'src/pour-kettle.ts',
    'const pourKettle = { cups: 2 };\n\nexport default pourKettle satisfies object;\n',
  ],
  [
    'a file named for the root of a dotted namespace',
    'src/pour-kettle.ts',
    'export namespace PourKettle.Spout {\n  export const cups = 2;\n}\n',
  ],
  [
    'a file named for a default export under as',
    'src/pour-kettle.ts',
    'const pourKettle = { cups: 2 };\n\nexport default pourKettle as object;\n',
  ],
  [
    'a file named for a default export under a non-null assertion',
    'src/pour-kettle.ts',
    'const pourKettle = { cups: 2 };\n\nexport default pourKettle!;\n',
  ],
  [
    'a file named for an export assignment',
    'src/pour-kettle.ts',
    'const pourKettle = { cups: 2 };\n\nexport = pourKettle;\n',
  ],
  ['index.ts with an export of another name', 'src/index.ts', 'export const kettleCups = 2;\n'],
  ['types.ts with an export of another name', 'src/types.ts', 'export const kettleCups = 2;\n'],
  [
    'constants.ts with an export of another name',
    'src/constants.ts',
    'export const kettleCups = 2;\n',
  ],
  [
    'a file with no exports',
    'src/pour-kettle.ts',
    'const kettleCups = 2;\n\nconsole.log(kettleCups);\n',
  ],
  [
    'a config file, whose role suffix marks a file a tool loads',
    'kettle.config.ts',
    'function defineKettle(cups: number): number {\n  return cups;\n}\n\nexport default defineKettle(2);\n',
  ],
  ['a test file', 'src/pour-kettle.test.ts', 'export const kettleCups = 2;\n'],
  [
    'a file that re-exports every name of a module',
    'src/pour-kettle.ts',
    "export * from './boil-kettle.ts';\n",
  ],
  [
    'a file that re-exports the default export of a module',
    'src/pour-kettle.ts',
    "export { default } from './boil-kettle.ts';\n",
  ],
  [
    'a script that only marks itself a module with an empty export',
    'src/pour-kettle.ts',
    'console.log(2);\n\nexport {};\n',
  ],
])('it passes %s', async (_, path, source) => {
  const result = await runLintTree({ [path]: source }, path, {
    'zgeoff/file-named-for-export': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each([
  ['packages/api/src/pour-kettle.ts', 'packages/api'],
  ['packages/api/src/pour-kettle.ts', './packages/api/'],
  ['packages/api/scripts/pour-kettle.ts', 'packages/api'],
  ['src/pour-kettle.ts', '.'],
])('it passes a mismatched %s when pending lists its package as %s', async (path, entry) => {
  const directory = await createLintTree(
    {
      'package.json': '{ "name": "kettles" }',
      'packages/api/package.json': '{ "name": "api" }',
      [path]: 'export function boilKettle(): void {}\n',
    },
    { 'zgeoff/file-named-for-export': ['error', { pending: [entry] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/file-named-for-export', [path]);

  expect(messages).toStrictEqual([]);
});

test('it reports a mismatched file in a package that pending leaves out', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/pour-kettle.ts': 'export function boilKettle(): void {}\n',
      'packages/web/package.json': '{ "name": "web" }',
      'packages/web/src/pour-kettle.ts': 'export function boilKettle(): void {}\n',
    },
    { 'zgeoff/file-named-for-export': ['error', { pending: ['packages/api'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/file-named-for-export', [
    'packages/api/src/pour-kettle.ts',
    'packages/web/src/pour-kettle.ts',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: 'packages/web/src/pour-kettle.ts',
      line: 1,
      message:
        "No export of 'pour-kettle.ts' is named for the file: name the main export 'pour-kettle' in camelCase, PascalCase or SCREAMING_SNAKE_CASE, or rename the file for its main export.",
    },
  ]);
});

test.each([
  ['no options', 'error'],
  ['an empty pending list', ['error', { pending: [] }]],
])('it reports a mismatched file in a package with %s', async (_, setting) => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/pour-kettle.ts': 'export function boilKettle(): void {}\n',
    },
    { 'zgeoff/file-named-for-export': setting },
  );

  const messages = await runLintMessages(directory, 'zgeoff/file-named-for-export', [
    'packages/api/src/pour-kettle.ts',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: 'packages/api/src/pour-kettle.ts',
      line: 1,
      message:
        "No export of 'pour-kettle.ts' is named for the file: name the main export 'pour-kettle' in camelCase, PascalCase or SCREAMING_SNAKE_CASE, or rename the file for its main export.",
    },
  ]);
});

test('it reports a mismatched file in a package nested inside one that pending lists', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/plugins/brew/package.json': '{ "name": "brew" }',
      'packages/api/plugins/brew/src/pour-kettle.ts': 'export function boilKettle(): void {}\n',
    },
    { 'zgeoff/file-named-for-export': ['error', { pending: ['packages/api'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/file-named-for-export', [
    'packages/api/plugins/brew/src/pour-kettle.ts',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: 'packages/api/plugins/brew/src/pour-kettle.ts',
      line: 1,
      message:
        "No export of 'pour-kettle.ts' is named for the file: name the main export 'pour-kettle' in camelCase, PascalCase or SCREAMING_SNAKE_CASE, or rename the file for its main export.",
    },
  ]);
});

test('it passes a mismatched file under a package.json inside the src/ of a package that pending lists', async () => {
  const directory = await createLintTree(
    {
      'packages/api/package.json': '{ "name": "api" }',
      'packages/api/src/package.json': '{ "type": "module" }',
      'packages/api/src/pour-kettle.ts': 'export function boilKettle(): void {}\n',
    },
    { 'zgeoff/file-named-for-export': ['error', { pending: ['packages/api'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/file-named-for-export', [
    'packages/api/src/pour-kettle.ts',
  ]);

  expect(messages).toStrictEqual([]);
});

test('it reports a pending entry that names no package on one file of the run', async () => {
  const directory = await createLintTree(
    {
      'packages/web/package.json': '{ "name": "web" }',
      'packages/web/src/pour-kettle.ts': 'export function pourKettle(): void {}\n',
      'packages/web/src/boil-kettle.ts': 'export function boilKettle(): void {}\n',
    },
    { 'zgeoff/file-named-for-export': ['error', { pending: ['packages/billing'] }] },
  );

  const messages = await runLintMessages(directory, 'zgeoff/file-named-for-export', [
    'packages/web',
  ]);

  expect(messages).toStrictEqual([
    {
      filename: expect.stringMatching(/^packages\/web\/src\/(?:pour|boil)-kettle\.ts$/u),
      line: 1,
      message:
        '`packages/billing` in the `pending` option of zgeoff/file-named-for-export names no package; remove it from `pending`.',
    },
  ]);
});
