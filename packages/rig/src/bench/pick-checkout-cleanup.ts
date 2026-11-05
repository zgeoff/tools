import type { BenchOutput, CheckoutState } from './types.ts';

export interface CheckoutCleanup {
  readonly output: readonly BenchOutput[];

  // A checkout that git still registers keeps its work folder, so git's record of the checkout
  // still points at a folder.
  readonly isWorkFolderKept: boolean;

  // A checkout that git still registers fails a comparison that passed.
  readonly exitCode: number;
}

export function pickCheckoutCleanup(baseRoot: string, checkout: CheckoutState): CheckoutCleanup {
  if (checkout !== 'left') {
    return { output: [], isWorkFolderKept: false, exitCode: 0 };
  }

  return {
    output: [
      {
        stream: 'err',
        text: `rig bench: could not remove the checkout at ${baseRoot}; remove it with git worktree remove --force ${baseRoot}\n`,
      },
    ],
    isWorkFolderKept: true,
    exitCode: 1,
  };
}
