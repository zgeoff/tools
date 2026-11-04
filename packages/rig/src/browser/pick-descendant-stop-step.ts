import { isZombieState } from './is-zombie-state.ts';
import type { ProcessEntry } from './read-process-table.ts';

export type DescendantStopStep =
  | { readonly kind: 'stopped' }
  | { readonly kind: 'wait' }
  | { readonly kind: 'failed'; readonly running: readonly number[] };

export interface DescendantStopState {
  readonly descendants: readonly number[];

  readonly listing: readonly ProcessEntry[] | null;

  readonly isPastDeadline: boolean;
}

// A killed process stays in its cgroup until its parent or the host's first process reaps it, so
// the stop waits until each one leaves the listing. A host whose first process never reaps its
// orphans keeps a zombie forever, so at the deadline only a process that is no zombie fails it.
export function pickDescendantStopStep(state: DescendantStopState): DescendantStopStep {
  // A failed listing leaves every process's state unknown, so each one counts as running.
  if (state.listing === null) {
    return state.isPastDeadline ? { kind: 'failed', running: state.descendants } : { kind: 'wait' };
  }

  const listing = state.listing;
  const listed = state.descendants.flatMap((pid) => listing.filter((entry) => entry.pid === pid));

  if (listed.length === 0) {
    return { kind: 'stopped' };
  }

  if (!state.isPastDeadline) {
    return { kind: 'wait' };
  }

  const running = listed.filter((entry) => !isZombieState(entry.state)).map((entry) => entry.pid);

  return running.length === 0 ? { kind: 'stopped' } : { kind: 'failed', running };
}
