import { match } from 'ts-pattern';
import type { StopPhase } from './pick-stop-step.ts';
import { pickStopStep } from './pick-stop-step.ts';
import { ProcessGroupStillRunningError } from './process-group-still-running-error.ts';
import { ProcessGroupStopError } from './process-group-stop-error.ts';
import type { ProcessGroups } from './process-groups.ts';
import type { ProcessRuntime } from './process-runtime.ts';

export interface ProcessGroupOptions {
  readonly cwd: string;

  readonly environment: Readonly<Record<string, string | undefined>>;

  readonly signal: AbortSignal;

  readonly stdout: 'inherit' | 'pipe';

  readonly stopDeadlineMs: number;

  readonly groups: ProcessGroups;

  readonly runtime: ProcessRuntime;
}

export interface StartedProcessGroup {
  readonly pid: number;

  readonly stdout: ReadableStream<Uint8Array> | null;

  // Settles once the command and every process left in its group have exited, and rejects with
  // ProcessGroupStillRunningError when the group outlives SIGKILL.
  readonly exited: Promise<number>;
}

// The command runs in a process group of its own, because `bun test` and a build start processes
// of their own, such as Chrome, that a signal to the command alone leaves running.
export function startProcessGroup(
  command: readonly string[],
  options: ProcessGroupOptions,
): StartedProcessGroup {
  const child = options.runtime.spawn(command, {
    cwd: options.cwd,
    environment: options.environment,
    stdout: options.stdout,
  });

  const abortStops: Promise<Error | null>[] = [];
  const abortStopFailed = Promise.withResolvers<Error>();

  const handleAbort = () => {
    abortStops.push(captureFailure(stopGroup(child.pid, options), abortStopFailed.resolve));
  };

  options.signal.addEventListener('abort', handleAbort, { once: true });

  if (options.signal.aborted) {
    handleAbort();
  }

  const exited = (async () => {
    try {
      // A leader that outlives SIGKILL never exits, so a failed stop settles the wait instead.
      const leaderOutcome = await Promise.race([child.exited, abortStopFailed.promise]);

      if (leaderOutcome instanceof Error) {
        throw leaderOutcome;
      }

      const abortStopFailures = await Promise.all(abortStops);

      const abortStopFailure = abortStopFailures.find((failure) => failure !== null);

      if (abortStopFailure !== undefined) {
        throw abortStopFailure;
      }

      await stopGroup(child.pid, options);

      return leaderOutcome;
    } finally {
      options.signal.removeEventListener('abort', handleAbort);
    }
  })();

  return { pid: child.pid, stdout: child.stdout, exited };
}

// An abort stops the group while the command still runs, and its failure belongs to the command's
// exit, so it waits there instead of rejecting with no handler.
async function captureFailure(
  stop: Promise<void>,
  onFailure: (failure: Error) => void,
): Promise<Error | null> {
  try {
    await stop;

    return null;
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error('rig could not stop a process group', { cause: error });

    onFailure(failure);

    return failure;
  }
}

// A failed probe or signal leaves the group's state unknown, so it fails the stop as well.
async function stopGroup(groupID: number, options: ProcessGroupOptions): Promise<void> {
  try {
    await runStopSteps(groupID, options);
  } catch (error) {
    if (error instanceof ProcessGroupStopError) {
      throw error;
    }

    throw new ProcessGroupStopError(groupID, `rig could not stop the process group ${groupID}`, {
      cause: error,
    });
  }
}

const groupProbeIntervalMs = 50;

async function runStopSteps(groupID: number, options: ProcessGroupOptions): Promise<void> {
  const stop: { phase: StopPhase; deadlineMs: number } = {
    phase: 'before-stop',
    deadlineMs: Number.POSITIVE_INFINITY,
  };

  for (;;) {
    const step = pickStopStep({
      phase: stop.phase,
      isGroupRunning: options.groups.probeGroup(groupID),
      isPastDeadline: options.runtime.now() >= stop.deadlineMs,
    });

    const isStopped = await match(step)
      .with({ kind: 'done' }, () => true)
      .with({ kind: 'fail' }, () => {
        throw new ProcessGroupStillRunningError(groupID);
      })
      .with({ kind: 'signal' }, (signalStep) => {
        options.groups.signalGroup(groupID, signalStep.signal);

        stop.phase = match(signalStep.signal)
          .with('SIGTERM', (): StopPhase => 'after-sigterm')
          .with('SIGKILL', (): StopPhase => 'after-sigkill')
          .exhaustive();

        stop.deadlineMs = options.runtime.now() + options.stopDeadlineMs;

        return false;
      })
      .with({ kind: 'wait' }, async () => {
        await options.runtime.sleep(groupProbeIntervalMs);

        return false;
      })
      .exhaustive();

    if (isStopped) {
      return;
    }
  }
}
