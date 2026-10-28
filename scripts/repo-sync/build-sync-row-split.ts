import type { SyncFileRow } from './build-copy-plan.ts';

export interface SyncRowSplit {
  // The rows whose file the caller takes.
  readonly taken: readonly SyncFileRow[];

  // The rows whose file the caller does not receive.
  readonly excluded: readonly SyncFileRow[];
}

// A table typed over every action, so a new action fails the type check until it has a side.
const rowSides: Readonly<Record<SyncFileRow['action'], keyof SyncRowSplit>> = {
  copy: 'taken',
  skip: 'excluded',
};

export function buildSyncRowSplit(rows: readonly SyncFileRow[]): SyncRowSplit {
  const taken: SyncFileRow[] = [];
  const excluded: SyncFileRow[] = [];
  const sides: Record<keyof SyncRowSplit, SyncFileRow[]> = { taken, excluded };

  for (const row of rows) {
    sides[rowSides[row.action]].push(row);
  }

  return { taken, excluded };
}
