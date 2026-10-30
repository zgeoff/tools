import { ProcessGroupStopError } from './process-group-stop-error.ts';

// A process group that the lane could not stop can still write to the run's folders, and the
// sweep of a later run needs its record, so the lane keeps them until the group has exited.
export function shouldKeepRunFolders(error: unknown): boolean {
  return error instanceof ProcessGroupStopError;
}
