import { killProcessGroups } from './kill-process-groups.ts';
import type { TestProcesses } from './test-processes.ts';

// Stops the process group of each child of the process, then the process's own group, and waits
// until none of them runs. A child that runs in a group of its own, such as one spawned detached,
// leads that group.
export async function stopProcessGroups(
  pid: number,
  processes: Pick<TestProcesses, 'listChildPids' | 'signalGroup' | 'probeGroup' | 'now' | 'sleep'>,
): Promise<void> {
  await killProcessGroups([...processes.listChildPids(pid), pid], processes);
}
