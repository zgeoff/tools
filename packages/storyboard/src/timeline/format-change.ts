import type { ChangeRecord } from './types.ts';

// A change with an id goes by its id. One without goes by its stage, its position, its component
// and its text.
export function formatChange(change: ChangeRecord): string {
  if (change.id !== undefined) {
    return `change "${change.id}"`;
  }

  return `stage ${change.stageIndex + 1}, change ${change.position} ${change.label}`;
}
