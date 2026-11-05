import { expect, test } from 'bun:test';
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
