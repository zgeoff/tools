import { match } from 'ts-pattern';
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
  let isStopped = false;

  while (!isStopped) {
    const step = pickDescendantStopStep({
      descendants,
      listing: stop.readProcessTable(),
      isPastDeadline: stop.clock.now() >= deadline,
    });

    isStopped = await match(step)
      .with({ kind: 'stopped' }, () => Promise.resolve(true))
      .with({ kind: 'failed' }, (failed) =>
        Promise.reject(
          new Error(
            `the processes ${failed.running.join(', ')} still run ${stop.deadlineMs} ms after SIGKILL`,
          ),
        ),
      )
      .with({ kind: 'wait' }, () => stop.clock.sleep(pollIntervalMs).then(() => false))
      .exhaustive();
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
