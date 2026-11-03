import type { ProcessEntry } from './read-process-table.ts';

export function collectDescendantPIDs(
  table: readonly ProcessEntry[],
  rootPID: number,
): readonly number[] {
  const descendants: number[] = [];
  const parents = [rootPID];

  for (const parentID of parents) {
    const children = table.filter((entry) => entry.parentID === parentID && entry.pid !== rootPID);

    for (const child of children) {
      if (!descendants.includes(child.pid)) {
        descendants.push(child.pid);
        parents.push(child.pid);
      }
    }
  }

  return descendants;
}
