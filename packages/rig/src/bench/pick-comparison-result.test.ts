import { expect, test } from 'bun:test';
import type { CheckoutCleanup } from './pick-checkout-cleanup.ts';
import { pickComparisonResult } from './pick-comparison-result.ts';

test.each<
  readonly [
    string,
    PromiseSettledResult<number>,
    PromiseSettledResult<CheckoutCleanup['result']>,
    CheckoutCleanup['result'],
  ]
>([
  [
    'gives the exit code of a cleanup that finished after a comparison that finished',
    { status: 'fulfilled', value: 3 },
    { status: 'fulfilled', value: { kind: 'exit', exitCode: 3 } },
    { kind: 'exit', exitCode: 3 },
  ],
  [
    'hands on the error of a comparison that threw when its cleanup finished',
    { status: 'rejected', reason: 'the kiln cracked' },
    { status: 'fulfilled', value: { kind: 'throw', error: 'the kiln cracked' } },
    { kind: 'throw', error: 'the kiln cracked' },
  ],
  [
    'hands on the error of a cleanup that threw after a comparison that finished',
    { status: 'fulfilled', value: 0 },
    { status: 'rejected', reason: 'the shelf collapsed' },
    { kind: 'throw', error: 'the shelf collapsed' },
  ],
])('it %s', (_title, compared, cleaned, expected) => {
  expect(pickComparisonResult(compared, cleaned)).toStrictEqual(expected);
});

test('it throws both errors, the comparison error first, when the comparison and its cleanup both threw', () => {
  const result = pickComparisonResult(
    { status: 'rejected', reason: 'the kiln cracked' },
    { status: 'rejected', reason: 'the shelf collapsed' },
  );

  expect(result).toStrictEqual({
    kind: 'throw',
    error: expect.objectContaining({
      constructor: AggregateError,
      message: 'the comparison failed, and its cleanup failed too',
      errors: ['the kiln cracked', 'the shelf collapsed'],
    }),
  });
});
