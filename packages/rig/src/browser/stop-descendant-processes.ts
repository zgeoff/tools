import { match } from 'ts-pattern';
import type { Clock } from '../system-clock.ts';
import { collectDescendantPIDs } from './collect-descendant-pids.ts';
import { hasErrorCode } from './has-error-code.ts';
import { pickDescendantStopStep } from './pick-descendant-stop-step.ts';
import { pickListingReadStep } from './pick-listing-read-step.ts';
import type { ProcessEntry } from './read-process-table.ts';

export interface DescendantStop {
  readonly rootPID: number;

  readonly timeoutMs: number;

  readonly clock: Clock;

  readonly readProcessTable: () => readonly ProcessEntry[] | null;

  // Throws as `process.kill` does: ESRCH for a process that has exited.
  readonly signalProcess: (pid: number, signal: NodeJS.Signals) => boolean;
}

const pollIntervalMs = 50;

export async function stopDescendantProcesses(stop: DescendantStop): Promise<void> {
  const deadlineMs = stop.clock.now() + stop.timeoutMs;

  const table = await readFirstListing(stop, deadlineMs);

  const descendants = collectDescendantPIDs(table, stop.rootPID);

  for (const pid of descendants) {
    killProcess(pid, stop);
  }

  let isStopped = false;

  while (!isStopped) {
    const step = pickDescendantStopStep({
      descendants,
      listing: stop.readProcessTable(),
      isPastDeadline: stop.clock.now() >= deadlineMs,
    });

    isStopped = await match(step)
      .with({ kind: 'stopped' }, () => Promise.resolve(true))
      .with({ kind: 'failed' }, (failed) =>
        Promise.reject(
          new Error(
            `the processes ${failed.running.join(', ')} still run ${stop.timeoutMs} ms after SIGKILL`,
          ),
        ),
      )
      .with({ kind: 'wait' }, () => stop.clock.sleep(pollIntervalMs).then(() => false))
      .exhaustive();
  }
}

// Only a listing names the processes to stop, so a failed one is read again until the deadline.
async function readFirstListing(
  stop: DescendantStop,
  deadlineMs: number,
): Promise<readonly ProcessEntry[]> {
  let listing: readonly ProcessEntry[] | null = null;

  while (listing === null) {
    const step = pickListingReadStep(stop.readProcessTable(), stop.clock.now() >= deadlineMs);

    listing = await match(step)
      .with({ kind: 'listed' }, (listed) => Promise.resolve(listed.listing))
      .with({ kind: 'failed' }, () =>
        Promise.reject(
          new Error(`the process listing failed for ${stop.timeoutMs} ms, so no process stopped`),
        ),
      )
      .with({ kind: 'retry' }, () => stop.clock.sleep(pollIntervalMs).then(() => null))
      .exhaustive();
  }

  return listing;
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
