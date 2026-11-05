import { expect, test } from 'bun:test';
import type { CommandOutput } from '../read-command-output.ts';
import { pickUnremovedCheckoutState } from './pick-unremoved-checkout-state.ts';
import type { CheckoutState } from './types.ts';

test.each<readonly [string, CommandOutput, string, Exclude<CheckoutState, 'removed'>]>([
  [
    'calls the checkout absent when git lists only other worktrees',
    {
      exitCode: 0,
      stdout:
        'worktree /kettle\0HEAD 1a2b3c\0branch refs/heads/main\0\0worktree /kettle-spout\0HEAD 4d5e6f\0detached\0\0',
    },
    '/kettle/.git/rig-bench/run-7/base',
    'absent',
  ],
  [
    'calls the checkout left when git lists it',
    {
      exitCode: 0,
      stdout:
        'worktree /kettle\0HEAD 1a2b3c\0branch refs/heads/main\0\0worktree /kettle/.git/rig-bench/run-7/base\0HEAD 4d5e6f\0detached\0\0',
    },
    '/kettle/.git/rig-bench/run-7/base',
    'left',
  ],
  [
    'compares the resolved paths',
    {
      exitCode: 0,
      stdout: 'worktree /kettle/.git/rig-bench/run-7/base/\0HEAD 4d5e6f\0detached\0\0',
    },
    '/kettle/.git/rig-bench/run-7/base',
    'left',
  ],
  [
    'ignores a worktree whose path only starts with the checkout path',
    {
      exitCode: 0,
      stdout: 'worktree /kettle/.git/rig-bench/run-7/base-old\0HEAD 4d5e6f\0detached\0\0',
    },
    '/kettle/.git/rig-bench/run-7/base',
    'absent',
  ],
  [
    'calls the checkout left when git lists it under a path that holds a newline',
    {
      exitCode: 0,
      stdout:
        'worktree /tea\nkettle\0HEAD 1a2b3c\0branch refs/heads/main\0\0worktree /tea\nkettle/.git/rig-bench/run-7/base\0HEAD 4d5e6f\0detached\0\0',
    },
    '/tea\nkettle/.git/rig-bench/run-7/base',
    'left',
  ],
  [
    'calls the checkout left when the listing fails',
    { exitCode: 128, stdout: '' },
    '/kettle/.git/rig-bench/run-7/base',
    'left',
  ],
])('it %s', (_title, listing, baseRoot, expected) => {
  expect(pickUnremovedCheckoutState(listing, baseRoot)).toBe(expected);
});
