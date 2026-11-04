import type { ProcessEntry } from './read-process-table.ts';

export type ListingReadStep =
  | { readonly kind: 'listed'; readonly listing: readonly ProcessEntry[] }
  | { readonly kind: 'retry' }
  | { readonly kind: 'failed' };

export function pickListingReadStep(
  listing: readonly ProcessEntry[] | null,
  isPastDeadline: boolean,
): ListingReadStep {
  if (listing !== null) {
    return { kind: 'listed', listing };
  }

  return isPastDeadline ? { kind: 'failed' } : { kind: 'retry' };
}
