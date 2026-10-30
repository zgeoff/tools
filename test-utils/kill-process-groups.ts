import type { TestProcesses } from './test-processes.ts';

const exitDeadlineMs = 5000;
const probeIntervalMs = 20;

// Sends SIGKILL to each group, then waits until no member of any of them runs, so the cleanup
// that follows removes no folder that a member can still write to.
export async function killProcessGroups(
  groupIDs: readonly number[],
  processes: Pick<TestProcesses, 'signalGroup' | 'probeGroup' | 'now' | 'sleep'>,
): Promise<void> {
  for (const groupID of groupIDs) {
    processes.signalGroup(groupID, 'SIGKILL');
  }

  const deadlineMs = processes.now() + exitDeadlineMs;

  for (;;) {
    const running = groupIDs.filter((groupID) => processes.probeGroup(groupID));

    if (running.length === 0) {
      return;
    }

    if (processes.now() >= deadlineMs) {
      throw new Error(`the process groups ${running.join(', ')} still run after SIGKILL`);
    }

    await processes.sleep(probeIntervalMs);
  }
}
