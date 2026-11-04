import { match } from 'ts-pattern';
import type { Clock } from '../system-clock.ts';
import { hasErrorCode } from './has-error-code.ts';
import { pickDescendantStopStep } from './pick-descendant-stop-step.ts';
import { pickFreezeStep } from './pick-freeze-step.ts';
import type { ProcessEntry } from './read-process-table.ts';

export interface DescendantStop {
  readonly rootPID: number;

  readonly deadlineMs: number;

  readonly clock: Clock;

  readonly readProcessTable: () => readonly ProcessEntry[] | null;

  // Throws as `process.kill` does: ESRCH for a process that has exited.
  readonly signalProcess: (pid: number, signal: NodeJS.Signals) => boolean;
}

const pollIntervalMs = 50;

export async function stopDescendantProcesses(stop: DescendantStop): Promise<void> {
  const deadline = stop.clock.now() + stop.deadlineMs;

  const descendants = await freezeDescendants(stop, deadline);

  for (const pid of descendants) {
    signalLiveProcess(pid, 'SIGKILL', stop);
  }

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

// A descendant can fork between a listing and its SIGKILL, and the child would escape the stop, so
// the stop halts each descendant with SIGSTOP and lists again until a listing shows no new one.
async function freezeDescendants(
  stop: DescendantStop,
  deadline: number,
): Promise<readonly number[]> {
  const frozen: number[] = [];
  let isFrozen = false;

  while (!isFrozen) {
    const step = pickFreezeStep({
      rootPID: stop.rootPID,
      listing: stop.readProcessTable(),
      frozen,
      isPastDeadline: stop.clock.now() >= deadline,
    });

    isFrozen = await match(step)
      .with({ kind: 'freeze' }, (next) => {
        for (const pid of next.pids) {
          signalLiveProcess(pid, 'SIGSTOP', stop);
        }

        frozen.push(...next.pids);

        return Promise.resolve(false);
      })
      .with({ kind: 'frozen' }, () => Promise.resolve(true))
      .with({ kind: 'retry' }, () => stop.clock.sleep(pollIntervalMs).then(() => false))
      .with({ kind: 'failed' }, () =>
        Promise.reject(
          new Error(`the process listing failed for ${stop.deadlineMs} ms, so no process stopped`),
        ),
      )
      .exhaustive();
  }

  return frozen;
}

function signalLiveProcess(pid: number, signal: NodeJS.Signals, stop: DescendantStop): void {
  try {
    stop.signalProcess(pid, signal);
  } catch (error) {
    if (!hasErrorCode(error, 'ESRCH')) {
      throw error;
    }
  }
}
