import type { SyncCommitVerdict } from './pick-sync-commit-verdict.ts';

// What a run writes and how it exits when the verdict ends it; null lets the sync go on.
export interface SyncVerdictStop {
  readonly exitCode: number;
  readonly line: string;
}

type SyncCommitVerdictOf<Kind extends SyncCommitVerdict['kind']> = Extract<
  SyncCommitVerdict,
  { readonly kind: Kind }
>;

type SyncVerdictStopPicker<Kind extends SyncCommitVerdict['kind']> = (
  verdict: SyncCommitVerdictOf<Kind>,
  commit: string,
) => SyncVerdictStop | null;

// A table typed over every verdict, so a new kind fails the type check until it has a stop.
const syncVerdictStopPickers: {
  readonly [Kind in SyncCommitVerdict['kind']]: SyncVerdictStopPicker<Kind>;
} = {
  current: () => null,
  refused: (verdict) => ({ exitCode: 1, line: `::error::${verdict.message}\n` }),
  superseded: (verdict, commit) => ({
    exitCode: 0,
    line: `${verdict.holder} already pins ${verdict.pin}, which is newer than ${commit}; nothing to do.\n`,
  }),
};

export function pickVerdictStop<Kind extends SyncCommitVerdict['kind']>(
  verdict: SyncCommitVerdictOf<Kind>,
  commit: string,
): SyncVerdictStop | null {
  const pick: SyncVerdictStopPicker<Kind> = syncVerdictStopPickers[verdict.kind];

  return pick(verdict, commit);
}
