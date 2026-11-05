import { expect, test } from 'bun:test';
import type { BaseSetupStep } from './find-base-setup-verdict.ts';
import { findBaseSetupVerdict } from './find-base-setup-verdict.ts';
import type { BenchVerdict } from './types.ts';

test.each<readonly [string, BaseSetupStep, number, BenchVerdict | null]>([
  ['a checkout that worked', 'checkout', 0, null],
  ['an install that worked', 'install', 0, null],
  [
    'a checkout that failed',
    'checkout',
    128,
    {
      output: [{ stream: 'err', text: 'rig bench: could not check out "kettle-v0"\n' }],
      exitCode: 1,
    },
  ],
  [
    'an install that failed',
    'install',
    1,
    {
      output: [
        { stream: 'err', text: 'rig bench: bun install failed in the checkout of "kettle-v0"\n' },
      ],
      exitCode: 1,
    },
  ],
])('it decides %s', (_title, step, exitCode, expected) => {
  expect(findBaseSetupVerdict(step, 'kettle-v0', exitCode)).toStrictEqual(expected);
});
