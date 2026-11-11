import { expect, test } from 'bun:test';
import { runLintTree } from './src/test-utils/run-lint-tree.ts';

test('it accepts a benchmark file whose default export is a defineBench call', async () => {
  const source =
    "import { defineBench } from '@zgeoff/rig/bench';\n\nexport default defineBench({\n  name: 'boil a kettle',\n  budget: '20ms',\n  run: () => {},\n});\n";

  const result = await runLintTree({ 'boil-kettle.bench.ts': source }, 'boil-kettle.bench.ts', {
    'zgeoff/bench-shape': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it accepts defineBench under another local name', async () => {
  const source =
    "import { defineBench as define } from '@zgeoff/rig/bench';\n\nexport default define({ name: 'boil a kettle', budget: '20ms', run: () => {} });\n";

  const result = await runLintTree({ 'boil-kettle.bench.ts': source }, 'boil-kettle.bench.ts', {
    'zgeoff/bench-shape': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each([
  [
    'a benchmark file with no default export',
    "import { bench } from 'mitata';\n\nbench('boil a kettle', () => {});\n",
  ],
  [
    'a default export that is not a call',
    "export default { name: 'boil a kettle', budget: '20ms', run: () => {} };\n",
  ],
  [
    'a defineBench that the file declares itself',
    "function defineBench(options: object) {\n  return options;\n}\n\nexport default defineBench({ name: 'boil a kettle' });\n",
  ],
  [
    'a defineBench from another module',
    "import { defineBench } from './define-bench.ts';\n\nexport default defineBench({ name: 'boil a kettle' });\n",
  ],
  [
    'another export of the rig bench entry',
    "import { runBench } from '@zgeoff/rig/bench';\n\nexport default runBench({ name: 'boil a kettle' });\n",
  ],
])('it reports %s', async (_, source) => {
  const result = await runLintTree({ 'boil-kettle.bench.ts': source }, 'boil-kettle.bench.ts', {
    'zgeoff/bench-shape': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(bench-shape)');
  expect(result.stdout).toInclude('export default defineBench({ name, budget, run })');
});

test('it accepts a file that is not a benchmark file', async () => {
  const result = await runLintTree(
    { 'boil-kettle.ts': 'export function boilKettle() {\n  return 100;\n}\n' },
    'boil-kettle.ts',
    { 'zgeoff/bench-shape': 'error' },
  );

  expect(result.exitCode).toBe(0);
});
