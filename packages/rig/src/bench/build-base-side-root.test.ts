import { expect, test } from 'bun:test';
import { buildBaseSideRoot } from './build-base-side-root.ts';

test.each<readonly [string, string, string]>([
  ['uses the checkout root for an empty prefix', '', '/kettle/.git/rig-bench/run-7/base'],
  [
    'joins a package prefix to the checkout root without its trailing slash',
    'packages/kettle/',
    '/kettle/.git/rig-bench/run-7/base/packages/kettle',
  ],
])('it %s', (_title, gitPrefix, expected) => {
  expect(buildBaseSideRoot('/kettle/.git/rig-bench/run-7/base', gitPrefix)).toBe(expected);
});
