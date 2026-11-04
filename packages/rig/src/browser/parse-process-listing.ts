import type { ProcessEntry } from './read-process-table.ts';

// `ps` lists itself too, as a child of the reader that has exited by then, so the parse leaves out
// the entry whose process ID is the listing's own.
export function parseProcessListing(stdout: string, listingPID: number): readonly ProcessEntry[] {
  return stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/u))
    .flatMap(([pid, parentID, groupID, state]) =>
      pid === undefined || parentID === undefined || groupID === undefined || state === undefined
        ? []
        : [{ pid: Number(pid), parentID: Number(parentID), groupID: Number(groupID), state }],
    )
    .filter((entry) => entry.pid !== listingPID);
}
