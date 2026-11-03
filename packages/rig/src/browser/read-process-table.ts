export interface ProcessEntry {
  readonly pid: number;

  readonly parentID: number;

  readonly groupID: number;

  readonly state: string;
}

// Null when `ps` fails to start or exits nonzero. `ps -A` lists every process, so a nonzero exit
// is a failed listing, never a sign that a process has exited.
export function readProcessTable(): readonly ProcessEntry[] | null {
  const listing = runListing();

  if (listing === null || listing.exitCode !== 0) {
    return null;
  }

  return listing.stdout
    .toString()
    .split('\n')
    .map((line) => line.trim().split(/\s+/u))
    .flatMap(([pid, parentID, groupID, state]) =>
      pid === undefined || parentID === undefined || groupID === undefined || state === undefined
        ? []
        : [{ pid: Number(pid), parentID: Number(parentID), groupID: Number(groupID), state }],
    );
}

function runListing() {
  try {
    return Bun.spawnSync(['ps', '-A', '-o', 'pid=,ppid=,pgid=,stat=']);
  } catch {
    return null;
  }
}
