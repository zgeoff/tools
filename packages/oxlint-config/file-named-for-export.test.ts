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
])('it reports a file with %s', async (_, source) => {
  const result = await runLintTree({ 'src/pour-kettle.ts': source }, 'src/pour-kettle.ts', {
    'zgeoff/file-named-for-export': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(file-named-for-export)');
  expect(result.stdout).toInclude("No export of 'pour-kettle.ts' is named for the file");
});

test.each([
  ['a function', 'src/pour-kettle.ts', 'export function pourKettle(): void {}\n'],
  [
    'a name that differs only in case',
    'src/parse-cli-args.ts',
    'export function parseCLIArgs(): void {}\n',
  ],
  ['a type', 'src/kettle-state.ts', "export type KettleState = 'cold' | 'hot';\n"],
  [
    'an interface',
    'src/kettle-state.ts',
    'export interface KettleState {\n  readonly cups: number;\n}\n',
  ],
  ['a SCREAMING_SNAKE_CASE const', 'src/max-kettles.ts', 'export const MAX_KETTLES = 4;\n'],
  [
    'a named default export',
    'src/pour-kettle.ts',
    'export default function pourKettle(): void {}\n',
  ],
  [
    'a default export of an identifier',
    'src/pour-kettle.ts',
    'const pourKettle = { cups: 2 };\n\nexport default pourKettle;\n',
  ],
  [
    'one export among several',
    'src/pour-kettle.ts',
    'export const kettleCups = 2;\n\nexport function pourKettle(): void {}\n',
  ],
  [
    'a destructured const',
    'src/pour-kettle.ts',
    'const kettle = { pourKettle: 1 };\n\nexport const { pourKettle } = kettle;\n',
  ],
  [
    'a re-export under the file name',
    'src/pour-kettle.ts',
    "export { boilKettle as pourKettle } from './boil-kettle.ts';\n",
  ],
  [
    'a component in a .tsx file',
    'src/kettle-card.tsx',
    'export function KettleCard(): null {\n  return null;\n}\n',
  ],
])('it accepts a file named for %s', async (_, path, source) => {
  const result = await runLintTree({ [path]: source }, path, {
    'zgeoff/file-named-for-export': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each([
  ['index.ts', 'src/index.ts'],
  ['types.ts', 'src/types.ts'],
  ['constants.ts', 'src/constants.ts'],
])('it exempts %s', async (_, path) => {
  const result = await runLintTree({ [path]: 'export const kettleCups = 2;\n' }, path, {
    'zgeoff/file-named-for-export': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each([
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
])('it skips %s', async (_, path, source) => {
  const result = await runLintTree({ [path]: source }, path, {
    'zgeoff/file-named-for-export': 'error',
  });

  expect(result.exitCode).toBe(0);
});
