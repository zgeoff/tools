import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';
import { collectPackageImports } from './collect-package-imports.ts';

test.each([
  { source: "import { pourTea } from '@acme/teapot';\npourTea();\n" },
  { source: "import type { Teapot } from '@acme/teapot';\nlet pot: Teapot;\n" },
  { source: "import type Teapot from '@acme/teapot';\nlet pot: Teapot;\n" },
  { source: "import { type Teapot } from '@acme/teapot';\nlet pot: Teapot;\n" },
  { source: "import { type Teapot as Pot } from '@acme/teapot';\nlet pot: Pot;\n" },
  { source: "import { Teapot } from '@acme/teapot';\nlet pot: Teapot;\n" },
  { source: "import '@acme/teapot';\n" },
  { source: "export { pourTea } from '@acme/teapot';\n" },
  { source: "export type { Teapot } from '@acme/teapot';\n" },
  { source: "export type * from '@acme/teapot';\n" },
  { source: "const teapot = await import('@acme/teapot');\n" },
  { source: "const teapot = await import(\n  '@acme/teapot'\n);\n" },
  { source: 'const teapot = await import(`@acme/teapot`);\n' },
  { source: "const teapot = require('@acme/teapot');\n" },
  { source: 'const teapot = require(`@acme/teapot`);\n' },
  { source: "type Teapot = typeof import('@acme/teapot');\n" },
  { source: "type Teapot = typeof import(/* the pot */ '@acme/teapot');\n" },
  { source: "let pot: import('@acme/teapot').Teapot;\n" },
  { source: "import Teapot = require('@acme/teapot');\n" },
])('#collectPackageImports finds the package in $source', (row) => {
  expect(collectPackageImports(row.source, 'brew.ts')).toStrictEqual(['@acme/teapot']);
});

test.each([
  { source: "// import '@acme/teapot';\n" },
  { source: "/* import { pourTea } from '@acme/teapot'; */\n" },
  { source: 'const note = "import \'@acme/teapot\'";\n' },
  { source: 'const note = \'require("@acme/teapot")\';\n' },
  { source: `const hint = \`\${'brew'} import '@acme/teapot'\`;\n` },
  { source: "const keywords = ['from','import','require'];\n" },
  { source: 'export type Teapot = \'import "@acme/teapot"\';\n' },
])('#collectPackageImports finds no package in $source', (row) => {
  expect(collectPackageImports(row.source, 'brew.ts')).toStrictEqual([]);
});

test('#collectPackageImports leaves out built-in modules and paths', () => {
  const source = [
    "import { readFileSync } from 'node:fs';",
    "import { expect } from 'bun:test';",
    "import { $ } from 'bun';",
    "import { steep } from './steep.ts';",
    "import { cup } from '../cup.ts';",
    "import { tray } from '/srv/tray.ts';",
    '',
  ].join('\n');

  expect(collectPackageImports(source, 'brew.ts')).toStrictEqual([]);
});

test('#collectPackageImports names each package once by its name, sorted', () => {
  const source = [
    "import { warmCup } from 'cup-warmer/sync';",
    "import { pourTea } from '@acme/teapot/pour';",
    "import { Teapot } from '@acme/teapot';",
    '',
  ].join('\n');

  expect(collectPackageImports(source, 'brew.ts')).toStrictEqual(['@acme/teapot', 'cup-warmer']);
});

test('#collectPackageImports reads JSX in a .tsx file', () => {
  const source = "import { Kettle } from '@acme/kettle';\nconst view = <Kettle />;\n";

  expect(collectPackageImports(source, 'kettle.tsx')).toStrictEqual(['@acme/kettle']);
});

test('#collectPackageImports returns null for a source that does not parse', () => {
  expect(collectPackageImports('const = ;\n', 'brew.ts')).toBeNull();
});

test('it prints its usage and exits 2 without a file argument', async () => {
  const result = await $`bun ${join(import.meta.dir, 'collect-package-imports.ts')}`
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'usage: collect-package-imports.ts <file>\n',
  });
});
