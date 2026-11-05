import type { BenchOutput, CheckoutState } from './types.ts';

export interface CheckoutCleanup {
  readonly output: readonly BenchOutput[];

  // A checkout that git still registers keeps its work folder, so git's record of the checkout
  // still points at a folder.
  readonly isWorkFolderKept: boolean;

  readonly result:
    | { readonly kind: 'exit'; readonly exitCode: number }
    | { readonly kind: 'throw'; readonly error: unknown };
}

export function pickCheckoutCleanup(
  baseRoot: string,
  checkout: CheckoutState,
  compared: PromiseSettledResult<number>,
): CheckoutCleanup {
  const isWorkFolderKept = checkout === 'left';

  const output: readonly BenchOutput[] = isWorkFolderKept
    ? [
        {
          stream: 'err',
          text: `rig bench: could not remove the checkout at ${baseRoot}; remove it with git worktree remove --force ${baseRoot}\n`,
        },
      ]
    : [];

  if (compared.status === 'rejected') {
    return { output, isWorkFolderKept, result: { kind: 'throw', error: compared.reason } };
  }

  const exitCode = isWorkFolderKept && compared.value === 0 ? 1 : compared.value;

  return { output, isWorkFolderKept, result: { kind: 'exit', exitCode } };
}
