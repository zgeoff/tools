import { expect, test } from 'bun:test';
import type { CheckoutRemoval } from './pick-checkout-removal.ts';
import { pickCheckoutRemoval } from './pick-checkout-removal.ts';

test.each<readonly [string, number, PromiseSettledResult<number>, CheckoutRemoval]>([
  [
    'keeps the exit code when the removal works',
    0,
    { status: 'fulfilled', value: 3 },
    { isCheckoutLeft: false, output: [], result: { kind: 'exit', exitCode: 3 } },
  ],
  [
    'fails a passing comparison when the removal fails',
    1,
    { status: 'fulfilled', value: 0 },
    {
      isCheckoutLeft: true,
      output: [
        {
          stream: 'err',
          text: 'rig bench: could not remove the checkout at /kettle/base; remove it with git worktree remove --force /kettle/base\n',
        },
      ],
      result: { kind: 'exit', exitCode: 1 },
    },
  ],
  [
    'keeps the exit code of a failed comparison when the removal fails',
    1,
    { status: 'fulfilled', value: 3 },
    {
      isCheckoutLeft: true,
      output: [
        {
          stream: 'err',
          text: 'rig bench: could not remove the checkout at /kettle/base; remove it with git worktree remove --force /kettle/base\n',
        },
      ],
      result: { kind: 'exit', exitCode: 3 },
    },
  ],
  [
    'hands on the error of a comparison that threw when the removal fails',
    1,
    { status: 'rejected', reason: 'the kiln cracked' },
    {
      isCheckoutLeft: true,
      output: [
        {
          stream: 'err',
          text: 'rig bench: could not remove the checkout at /kettle/base; remove it with git worktree remove --force /kettle/base\n',
        },
      ],
      result: { kind: 'throw', error: 'the kiln cracked' },
    },
  ],
])('it %s', (_title, removeExitCode, compared, expected) => {
  expect(pickCheckoutRemoval('/kettle/base', removeExitCode, compared)).toStrictEqual(expected);
});
