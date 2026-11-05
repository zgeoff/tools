import { resolve } from 'node:path';
import type { CommandOutput } from '../read-command-output.ts';
import type { CheckoutState } from './types.ts';

// Takes what `git worktree list --porcelain -z` gave after a failed removal. A listing that failed
// cannot show the checkout is gone, so the checkout counts as left.
export function pickUnremovedCheckoutState(
  listing: CommandOutput,
  baseRoot: string,
): Exclude<CheckoutState, 'removed'> {
  if (listing.exitCode !== 0) {
    return 'left';
  }

  const isListed = collectWorktreePaths(listing.stdout).some(
    (path) => resolve(path) === resolve(baseRoot),
  );

  return isListed ? 'left' : 'absent';
}

// Each field ends in NUL and each record ends in an empty field, so a path that holds a newline
// stays whole.
function collectWorktreePaths(stdout: string): string[] {
  return stdout
    .split('\0\0')
    .map((record) => record.split('\0')[0] ?? '')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => field.slice('worktree '.length));
}
