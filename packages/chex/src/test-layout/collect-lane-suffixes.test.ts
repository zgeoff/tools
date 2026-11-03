import { expect, test } from 'bun:test';
import { collectLaneSuffixes } from './collect-lane-suffixes.ts';

test('it gives the standard lanes their suffixes and leaves out the e2e lane', () => {
  expect(collectLaneSuffixes(null, null)).toStrictEqual([
    '.agent-sdk',
    '.browser',
    '.docker',
    '.host',
    '.model-api',
  ]);
});

test('it adds the suffix of each lane that rig.config.ts resolves', () => {
  const suffixes = collectLaneSuffixes(null, {
    lanes: [
      { name: 'unit', suffix: null },
      { name: 'oven', suffix: '.bake' },
    ],
  });

  expect(suffixes).toContain('.bake');
  expect(suffixes).not.toContain('.unit');
});

test('it adds the lanes of the oxlint config', () => {
  const suffixes = collectLaneSuffixes(
    '{ "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": ["radar"] }] } }',
    null,
  );

  expect(suffixes).toContain('.radar');
});
