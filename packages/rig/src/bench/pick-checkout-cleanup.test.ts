import { expect, test } from 'bun:test';
import type { CheckoutCleanup } from './pick-checkout-cleanup.ts';
import { pickCheckoutCleanup } from './pick-checkout-cleanup.ts';
import type { CheckoutState } from './types.ts';

test.each<readonly [string, CheckoutState, CheckoutCleanup]>([
  [
    'exits 0 and removes the work folder when the checkout is removed',
    'removed',
    { output: [], isWorkFolderKept: false, exitCode: 0 },
  ],
  [
    'exits 0 and removes the work folder when git registers no checkout',
    'absent',
    { output: [], isWorkFolderKept: false, exitCode: 0 },
  ],
  [
    'exits 1, says how to remove the checkout and keeps the work folder when the checkout is left',
    'left',
    {
      output: [
        {
          stream: 'err',
          text: 'rig bench: could not remove the checkout at /kettle/base; remove it with git worktree remove --force /kettle/base\n',
        },
      ],
      isWorkFolderKept: true,
      exitCode: 1,
    },
  ],
])('it %s', (_title, checkout, expected) => {
  expect(pickCheckoutCleanup('/kettle/base', checkout)).toStrictEqual(expected);
});
