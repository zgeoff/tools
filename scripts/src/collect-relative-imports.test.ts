import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';
import { collectRelativeImports } from './collect-relative-imports.ts';

test('#collectRelativeImports returns each relative path once, sorted, and leaves out packages and built-in modules', () => {
  const source = [
    "import { readFileSync } from 'node:fs';",
    "import { pourTea } from '@acme/teapot';",
    "import { steep } from './steep.ts';",
    "import type { Cup } from '../cup.ts';",
    "export { steep as brew } from './steep.ts';",
    "const kettle = await import('./kettle.ts');",
    '',
  ].join('\n');

  expect(collectRelativeImports(source, 'brew.ts')).toStrictEqual([
    '../cup.ts',
    './kettle.ts',
    './steep.ts',
  ]);
});

test('#collectRelativeImports returns null for a source that does not parse', () => {
  expect(collectRelativeImports('const = ;\n', 'brew.ts')).toBeNull();
});

test('it prints its usage and exits 2 without a file argument', async () => {
  const result = await $`bun ${join(import.meta.dir, 'collect-relative-imports.ts')}`
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'usage: collect-relative-imports.ts <file>\n',
  });
});
