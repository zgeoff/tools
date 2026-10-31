import { join } from 'node:path';
import type { LaneFiles } from './lane-files.ts';
import type { ProcessGroups } from './process-groups.ts';

export interface RunProbeOptions {
  readonly files: Pick<LaneFiles, 'readDirNames' | 'removePath'>;

  readonly probeProcess: (pid: number) => boolean;

  readonly groups: Pick<ProcessGroups, 'probeGroup'>;
}

export const pendingRecordPrefix = 'pending-';

// A lane that SIGKILL stopped leaves its process groups running. An exited lane makes no more
// pending records, and a command starts only after it moves one, so once they are gone, the
// groups folder holds every group the run can ever have.
export async function probeRun(
  runID: string,
  groupsDir: string,
  options: RunProbeOptions,
): Promise<boolean> {
  if (options.probeProcess(Number(runID))) {
    return true;
  }

  const names = await options.files.readDirNames(groupsDir);

  const pendingRecords = names.filter((name) => name.startsWith(pendingRecordPrefix));

  await Promise.all(pendingRecords.map((name) => options.files.removePath(join(groupsDir, name))));

  const groupIDs = await options.files.readDirNames(groupsDir);

  return groupIDs
    .filter((groupID) => /^\d+$/u.test(groupID))
    .some((groupID) => options.groups.probeGroup(Number(groupID)));
}
