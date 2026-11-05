import type { CheckoutCleanup } from './pick-checkout-cleanup.ts';

type ComparisonResult = CheckoutCleanup['result'];

// Takes how the comparison settled and how its cleanup settled. A cleanup that throws after a
// comparison that threw keeps both errors, so the comparison's cause still reaches the caller.
export function pickComparisonResult(
  compared: PromiseSettledResult<number>,
  cleaned: PromiseSettledResult<ComparisonResult>,
): ComparisonResult {
  if (cleaned.status === 'fulfilled') {
    return cleaned.value;
  }

  if (compared.status === 'rejected') {
    return {
      kind: 'throw',
      error: new AggregateError(
        [compared.reason, cleaned.reason],
        'the comparison failed, and its cleanup failed too',
      ),
    };
  }

  return { kind: 'throw', error: cleaned.reason };
}
