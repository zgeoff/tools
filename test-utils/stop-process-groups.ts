import type { TestProcesses } from './test-processes.ts';

// Stops the process group of each child of the process, then the process's own group. A child
// that runs in a group of its own, such as one spawned detached, leads that group.
export function stopProcessGroups(
  pid: number,
  processes: Pick<TestProcesses, 'listChildPids' | 'signalGroup'>,
): void {
  for (const groupID of [...processes.listChildPids(pid), pid]) {
    processes.signalGroup(groupID, 'SIGKILL');
  }
}
