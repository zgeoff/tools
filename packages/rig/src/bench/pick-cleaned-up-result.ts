export type CleanedUpResult<T, C> =
  | { readonly kind: 'fulfilled'; readonly value: T; readonly cleanup: C }
  | { readonly kind: 'throw'; readonly error: unknown };

// Takes how a run settled and how its cleanup settled. A cleanup that throws after a run that threw
// keeps both errors, the run's first, so the run's cause still reaches the caller.
export function pickCleanedUpResult<T, C>(
  ran: PromiseSettledResult<T>,
  cleaned: PromiseSettledResult<C>,
): CleanedUpResult<T, C> {
  if (ran.status === 'rejected' && cleaned.status === 'rejected') {
    return {
      kind: 'throw',
      error: new AggregateError(
        [ran.reason, cleaned.reason],
        'the run failed, and its cleanup failed too',
      ),
    };
  }

  if (ran.status === 'rejected') {
    return { kind: 'throw', error: ran.reason };
  }

  if (cleaned.status === 'rejected') {
    return { kind: 'throw', error: cleaned.reason };
  }

  return { kind: 'fulfilled', value: ran.value, cleanup: cleaned.value };
}
