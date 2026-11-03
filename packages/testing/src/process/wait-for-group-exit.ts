import { groupDeadlineMs, pollIntervalMs } from './constants.ts';
import { probeGroup } from './probe-group.ts';
import { signalGroup } from './signal-group.ts';

// A process the program forked can outlive it by a moment, so the wait runs until the group
// empties, and kills what is left once it passes its deadline.
export async function waitForGroupExit(groupID: number): Promise<void> {
  const deadline = Date.now() + groupDeadlineMs;

  while (probeGroup(groupID)) {
    if (Date.now() >= deadline) {
      signalGroup(groupID, 'SIGKILL');
    }

    await Bun.sleep(pollIntervalMs);
  }
}
