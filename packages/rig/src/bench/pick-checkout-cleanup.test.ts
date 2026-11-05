import { expect, test } from 'bun:test';
import type { CheckoutCleanup } from './pick-checkout-cleanup.ts';
import { pickCheckoutCleanup } from './pick-checkout-cleanup.ts';
import type { CheckoutState } from './types.ts';

test.each<readonly [string, CheckoutState, PromiseSettledResult<number>, CheckoutCleanup]>([
  [
    'keeps the exit code and removes the work folder when the checkout is removed',
    'removed',
    { status: 'fulfilled', value: 3 },
    { output: [], isWorkFolderKept: false, result: { kind: 'exit', exitCode: 3 } },
  ],
  [
    'keeps the exit code and removes the work folder when git registers no checkout',
    'absent',
    { status: 'fulfilled', value: 0 },
    { output: [], isWorkFolderKept: false, result: { kind: 'exit', exitCode: 0 } },
  ],
  [
    'fails a passing comparison and keeps the work folder when the checkout is left',
    'left',
    { status: 'fulfilled', value: 0 },
    {
      output: [
        {
          stream: 'err',
          text: 'rig bench: could not remove the checkout at /kettle/base; remove it with git worktree remove --force /kettle/base\n',
        },
      ],
      isWorkFolderKept: true,
      result: { kind: 'exit', exitCode: 1 },
    },
  ],
  [
    'keeps the exit code of a failed comparison when the checkout is left',
    'left',
    { status: 'fulfilled', value: 3 },
    {
      output: [
        {
          stream: 'err',
          text: 'rig bench: could not remove the checkout at /kettle/base; remove it with git worktree remove --force /kettle/base\n',
        },
      ],
      isWorkFolderKept: true,
      result: { kind: 'exit', exitCode: 3 },
    },
  ],
  [
    'hands on the error of a comparison that threw when the checkout is left',
    'left',
    { status: 'rejected', reason: 'the kiln cracked' },
    {
      output: [
        {
          stream: 'err',
          text: 'rig bench: could not remove the checkout at /kettle/base; remove it with git worktree remove --force /kettle/base\n',
        },
      ],
      isWorkFolderKept: true,
      result: { kind: 'throw', error: 'the kiln cracked' },
    },
  ],
  [
    'hands on the error of a comparison that threw when the checkout is removed',
    'removed',
    { status: 'rejected', reason: 'the kiln cracked' },
    { output: [], isWorkFolderKept: false, result: { kind: 'throw', error: 'the kiln cracked' } },
  ],
])('it %s', (_title, checkout, compared, expected) => {
  expect(pickCheckoutCleanup('/kettle/base', checkout, compared)).toStrictEqual(expected);
});
