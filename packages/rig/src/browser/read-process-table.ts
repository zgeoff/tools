import { parseProcessListing } from './parse-process-listing.ts';

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

  return parseProcessListing(listing.stdout.toString(), listing.pid);
}

function runListing() {
  try {
    return Bun.spawnSync(['ps', '-A', '-o', 'pid=,ppid=,pgid=,stat=']);
  } catch {
    return null;
  }
}
