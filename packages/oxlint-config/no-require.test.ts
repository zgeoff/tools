import { expect, test } from 'bun:test';
import { runLintTree } from './test-utils/run-lint-tree.ts';

test.each([
  [
    'a named createRequire import of node:module',
    "import { createRequire } from 'node:module';\n\nexport const load = createRequire(import.meta.url);\n",
    'createRequire',
  ],
  [
    'a named createRequire import of module',
    "import { createRequire } from 'module';\n\nexport const load = createRequire(import.meta.url);\n",
    'createRequire',
  ],
  [
    'an aliased createRequire import',
    "import { createRequire as makeLoader } from 'node:module';\n\nexport const load = makeLoader(import.meta.url);\n",
    'createRequire',
  ],
  [
    'createRequire read off a namespace import',
    "import * as nodeModule from 'node:module';\n\nexport const load = nodeModule.createRequire(import.meta.url);\n",
    'createRequire',
  ],
  [
    'createRequire read off a default import by a computed key',
    "import nodeModule from 'node:module';\n\nexport const load = nodeModule['createRequire'](import.meta.url);\n",
    'createRequire',
  ],
  [
    'createRequire destructured from a default import',
    "import nodeModule from 'node:module';\n\nconst { createRequire } = nodeModule;\n\nexport const load = createRequire(import.meta.url);\n",
    'createRequire',
  ],
  [
    'createRequire destructured under another name',
    "import * as nodeModule from 'node:module';\n\nconst { createRequire: makeLoader } = nodeModule;\n\nexport const load = makeLoader(import.meta.url);\n",
    'createRequire',
  ],
  ['a call to the require global', "export const kettle = require('./kettle');\n", 'require'],
  ['a read of the require global', 'export const load = require;\n', 'require'],
])('it reports %s', async (_, source, word) => {
  const result = await runLintTree({ 'brew.ts': source }, 'brew.ts', {
    'zgeoff/no-require': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(no-require)');
  expect(result.stdout).toInclude(`never \`${word}\``);
});

test.each([
  [
    'another export of node:module',
    "import { isBuiltin } from 'node:module';\n\nexport const known = isBuiltin('node:fs');\n",
  ],
  [
    'another member of a node:module namespace',
    "import * as nodeModule from 'node:module';\n\nexport const names = nodeModule.builtinModules;\n",
  ],
  [
    'a type-only createRequire import',
    "import type { createRequire } from 'node:module';\n\nexport type Load = typeof createRequire;\n",
  ],
  [
    'a createRequire import of another module',
    "import { createRequire } from './loader';\n\nexport const load = createRequire(import.meta.url);\n",
  ],
  [
    'a local binding named require',
    "export function brew(require: (name: string) => string) {\n  return require('kettle');\n}\n",
  ],
  ['a property named require', 'export const settings = { require: true };\n'],
  [
    'another member destructured from a node:module import',
    "import nodeModule from 'node:module';\n\nconst { builtinModules } = nodeModule;\n\nexport const names = builtinModules;\n",
  ],
])('it accepts %s', async (_, source) => {
  const result = await runLintTree({ 'brew.ts': source }, 'brew.ts', {
    'zgeoff/no-require': 'error',
  });

  expect(result.exitCode).toBe(0);
});
