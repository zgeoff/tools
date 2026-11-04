import type { Clock } from '../system-clock.ts';
import { collectDescendantPIDs } from './collect-descendant-pids.ts';
import { hasErrorCode } from './has-error-code.ts';
import { pickDescendantStopStep } from './pick-descendant-stop-step.ts';
import type { ProcessEntry } from './read-process-table.ts';

export interface DescendantStop {
  readonly rootPID: number;

  readonly deadlineMs: number;

  readonly clock: Clock;

  readonly readProcessTable: () => readonly ProcessEntry[] | null;

  // Throws as `process.kill` does: ESRCH for a process that has exited.
  readonly signalProcess: (pid: number, signal: NodeJS.Signals) => void;
}

const pollIntervalMs = 50;

export async function stopDescendantProcesses(stop: DescendantStop): Promise<void> {
  const table = stop.readProcessTable();

  if (table === null) {
    return;
  }

  const descendants = collectDescendantPIDs(table, stop.rootPID);

  for (const pid of descendants) {
    killProcess(pid, stop);
  }

  const deadline = stop.clock.now() + stop.deadlineMs;

  for (;;) {
    const step = pickDescendantStopStep({
      descendants,
      listing: stop.readProcessTable(),
      isPastDeadline: stop.clock.now() >= deadline,
    });

    if (step.kind === 'stopped') {
      return;
    }

    if (step.kind === 'failed') {
      throw new Error(
        `the processes ${step.running.join(', ')} still run ${stop.deadlineMs} ms after SIGKILL`,
      );
    }

    await stop.clock.sleep(pollIntervalMs);
  }
}

function killProcess(pid: number, stop: DescendantStop): void {
  try {
    stop.signalProcess(pid, 'SIGKILL');
  } catch (error) {
    if (!hasErrorCode(error, 'ESRCH')) {
      throw error;
    }
  }
}
