import { mock } from 'bun:test';
import type { ProcessRuntime, SpawnedProcess } from '../sync/browser-lane/process-runtime.ts';
import { buildSteppingClock } from './build-stepping-clock.ts';

// A runtime whose spawned leader has the process ID and settles with the exit promise, such as one
// that never settles for a leader in uninterruptible I/O that outlives SIGKILL. Its clock moves
// only on a sleep, so a stop deadline passes with no real wait.
export function buildFakeProcessRuntime(pid: number, exited: Promise<number>) {
  const clock = buildSteppingClock();

  return {
    spawn: mock<ProcessRuntime['spawn']>((): SpawnedProcess => ({ pid, stdout: null, exited })),
    now: clock.now,
    sleep: clock.sleep,
  } satisfies ProcessRuntime;
}
