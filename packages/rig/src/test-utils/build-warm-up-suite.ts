export function buildWarmUpSuite(markPath: string): string {
  return [
    "import { writeFileSync } from 'node:fs';",
    "import { test } from 'bun:test';",
    '',
    "test('it starts Chrome', () => {",
    `  writeFileSync(${JSON.stringify(markPath)}, '');`,
    '});',
    '',
  ].join('\n');
}
