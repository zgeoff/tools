import type { ProcessEntry } from '../browser/read-process-table.ts';

// A listed process in one shared group, sleeping unless the state says otherwise.
export function buildProcessEntry(pid: number, parentID: number, state = 'S'): ProcessEntry {
  return { pid, parentID, groupID: 4100, state };
}
