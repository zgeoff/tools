import type { Clock } from '../system-clock.ts';
import { collectDescendantPIDs } from './collect-descendant-pids.ts';
import { hasErrorCode } from './has-error-code.ts';
import { isZombieState } from './is-zombie-state.ts';
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

// A killed process stays in its cgroup until its parent or the host's first process reaps it, so
// the stop waits until each one leaves the listing. A host whose first process never reaps its
// orphans keeps a zombie forever, so at the deadline only a process that is no zombie fails it.
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
    const listing = stop.readProcessTable();
    const remaining = collectRemainingPIDs(descendants, listing, { countsZombies: true });

    if (remaining.length === 0) {
      return;
    }

    if (stop.clock.now() >= deadline) {
      const running = collectRemainingPIDs(descendants, listing, { countsZombies: false });

      if (running.length > 0) {
        throw new Error(
          `the processes ${running.join(', ')} still run ${stop.deadlineMs} ms after SIGKILL`,
        );
      }

      return;
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

interface RemainingFilter {
  readonly countsZombies: boolean;
}

// A failed listing leaves every process's state unknown, so each one counts as running.
function collectRemainingPIDs(
  pids: readonly number[],
  table: readonly ProcessEntry[] | null,
  filter: RemainingFilter,
): readonly number[] {
  if (table === null) {
    return pids;
  }

  return pids.filter((pid) =>
    table.some(
      (entry) => entry.pid === pid && (filter.countsZombies || !isZombieState(entry.state)),
    ),
  );
}
