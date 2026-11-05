import { resolve } from 'node:path';
import type { CommandOutput } from '../read-command-output.ts';
import type { CheckoutState } from './types.ts';

// Takes what `git worktree list --porcelain` gave after a failed removal. A listing that failed
// cannot show the checkout is gone, so the checkout counts as left.
export function pickUnremovedCheckoutState(
  listing: CommandOutput,
  baseRoot: string,
): Exclude<CheckoutState, 'removed'> {
  if (listing.exitCode !== 0) {
    return 'left';
  }

  const isListed = listing.stdout
    .split('\n')
    .some(
      (line) =>
        line.startsWith('worktree ') &&
        resolve(line.slice('worktree '.length)) === resolve(baseRoot),
    );

  return isListed ? 'left' : 'absent';
}
