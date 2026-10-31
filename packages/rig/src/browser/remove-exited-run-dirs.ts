import { join } from 'node:path';
import type { LaneFiles } from './lane-files.ts';

// A run's folder takes the name of the lane's process ID. A folder whose run has ended, with its
// lane and every process group it recorded exited, belongs to an older run that a signal or a
// crash stopped before its cleanup.
export async function removeExitedRunDirs(
  parentDir: string,
  files: Pick<LaneFiles, 'readDirNames' | 'removePath'>,
  probeRun: (runID: string) => Promise<boolean>,
): Promise<void> {
  const entries = await files.readDirNames(parentDir);

  const runIDs = entries.filter((entry) => /^\d+$/u.test(entry));

  const isRunning = await Promise.all(runIDs.map((runID) => probeRun(runID)));

  const exited = runIDs.filter((_, index) => isRunning[index] !== true);

  await Promise.all(exited.map((runID) => files.removePath(join(parentDir, runID))));
}
