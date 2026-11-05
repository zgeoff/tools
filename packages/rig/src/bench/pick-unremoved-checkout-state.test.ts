import { expect, test } from 'bun:test';
import type { CommandOutput } from '../read-command-output.ts';
import { pickUnremovedCheckoutState } from './pick-unremoved-checkout-state.ts';
import type { CheckoutState } from './types.ts';

test.each<readonly [string, CommandOutput, Exclude<CheckoutState, 'removed'>]>([
  [
    'calls the checkout absent when git lists only other worktrees',
    {
      exitCode: 0,
      stdout:
        'worktree /kettle\nHEAD 1a2b3c\nbranch refs/heads/main\n\nworktree /kettle-spout\nHEAD 4d5e6f\ndetached\n\n',
    },
    'absent',
  ],
  [
    'calls the checkout left when git lists it',
    {
      exitCode: 0,
      stdout:
        'worktree /kettle\nHEAD 1a2b3c\nbranch refs/heads/main\n\nworktree /kettle/.git/rig-bench/run-7/base\nHEAD 4d5e6f\ndetached\n\n',
    },
    'left',
  ],
  [
    'compares the resolved paths',
    {
      exitCode: 0,
      stdout: 'worktree /kettle/.git/rig-bench/run-7/base/\nHEAD 4d5e6f\ndetached\n\n',
    },
    'left',
  ],
  [
    'ignores a worktree whose path only starts with the checkout path',
    {
      exitCode: 0,
      stdout: 'worktree /kettle/.git/rig-bench/run-7/base-old\nHEAD 4d5e6f\ndetached\n\n',
    },
    'absent',
  ],
  ['calls the checkout left when the listing fails', { exitCode: 128, stdout: '' }, 'left'],
])('it %s', (_title, listing, expected) => {
  expect(pickUnremovedCheckoutState(listing, '/kettle/.git/rig-bench/run-7/base')).toBe(expected);
});
