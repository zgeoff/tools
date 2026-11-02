import { expect, test } from 'bun:test';
import { buildWarmUpSuite } from './build-warm-up-suite.ts';

test('it builds a suite whose one test writes the mark file', () => {
  expect(buildWarmUpSuite('/repo/warm-up/warm-up.mark')).toBe(
    [
      "import { writeFileSync } from 'node:fs';",
      "import { test } from 'bun:test';",
      '',
      "test('it starts Chrome', () => {",
      '  writeFileSync("/repo/warm-up/warm-up.mark", \'\');',
      '});',
      '',
    ].join('\n'),
  );
});

test('it quotes a mark path that holds a quote', () => {
  expect(buildWarmUpSuite('/repo/it"s/warm-up.mark')).toInclude(
    String.raw`writeFileSync("/repo/it\"s/warm-up.mark", '');`,
  );
});
