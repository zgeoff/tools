import { expect, test } from 'bun:test';
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
