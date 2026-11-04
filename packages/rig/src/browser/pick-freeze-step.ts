import { collectDescendantPIDs } from './collect-descendant-pids.ts';
import type { ProcessEntry } from './read-process-table.ts';

export type FreezeStep =
  | { readonly kind: 'freeze'; readonly pids: readonly number[] }
  | { readonly kind: 'frozen' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'failed' };

export interface FreezeState {
  readonly rootPID: number;

  readonly listing: readonly ProcessEntry[] | null;

  readonly frozen: readonly number[];

  readonly isPastDeadline: boolean;
}

// Only a listing names the processes to stop, so a failed one is read again until the deadline.
// With no listing by then, the stop fails before it halts any process, and once it has halted some
// it kills those. A tree that keeps forking ends the freeze at the deadline too.
export function pickFreezeStep(state: FreezeState): FreezeStep {
  if (state.listing === null) {
    if (!state.isPastDeadline) {
      return { kind: 'retry' };
    }

    return state.frozen.length === 0 ? { kind: 'failed' } : { kind: 'frozen' };
  }

  if (state.isPastDeadline) {
    return { kind: 'frozen' };
  }

  const unfrozen = collectDescendantPIDs(state.listing, state.rootPID).filter(
    (pid) => !state.frozen.includes(pid),
  );

  return unfrozen.length === 0 ? { kind: 'frozen' } : { kind: 'freeze', pids: unfrozen };
}
