import type { BenchOutput } from './types.ts';

export interface CheckoutRemoval {
  // A checkout that git could not remove keeps its work folder, so git's record of the checkout
  // still points at a folder.
  readonly isCheckoutLeft: boolean;

  readonly output: readonly BenchOutput[];

  readonly result:
    | { readonly kind: 'exit'; readonly exitCode: number }
    | { readonly kind: 'throw'; readonly error: unknown };
}

export function pickCheckoutRemoval(
  baseRoot: string,
  removeExitCode: number,
  compared: PromiseSettledResult<number>,
): CheckoutRemoval {
  const isCheckoutLeft = removeExitCode !== 0;

  const output: readonly BenchOutput[] = isCheckoutLeft
    ? [
        {
          stream: 'err',
          text: `rig bench: could not remove the checkout at ${baseRoot}; remove it with git worktree remove --force ${baseRoot}\n`,
        },
      ]
    : [];

  if (compared.status === 'rejected') {
    return { isCheckoutLeft, output, result: { kind: 'throw', error: compared.reason } };
  }

  const exitCode = isCheckoutLeft && compared.value === 0 ? 1 : compared.value;

  return { isCheckoutLeft, output, result: { kind: 'exit', exitCode } };
}
