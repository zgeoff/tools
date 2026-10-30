import type { LaneFiles } from '../packages/rig/src/browser/lane-files.ts';
import { removeExitedRunDirs } from '../packages/rig/src/browser/remove-exited-run-dirs.ts';

export interface RigPackSweepOptions {
  readonly files: Pick<LaneFiles, 'readDirNames' | 'removePath'>;

  readonly probeProcess: (processID: number) => boolean;
}

// A run's pack folder takes the name of the lane's process ID, so a pack whose process has exited
// belongs to a run that a signal or a crash stopped before its stop hook.
export function removeExitedRigPacks(runsDir: string, options: RigPackSweepOptions): Promise<void> {
  return removeExitedRunDirs(runsDir, options.files, (runID) =>
    Promise.resolve(options.probeProcess(Number(runID))),
  );
}
