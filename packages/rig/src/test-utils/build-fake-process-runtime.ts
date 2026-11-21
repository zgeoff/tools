import { mock } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { ProcessRuntime, SpawnedProcess } from '../browser/process-runtime.ts';

// A runtime whose spawned leader has the process ID and settles with the exit promise, such as one
// that never settles for a leader in uninterruptible I/O that outlives SIGKILL. Its clock is a fake
// that the test steps, so a stop deadline passes with no real wait.
export function buildFakeProcessRuntime(pid: number, exited: Promise<number>) {
  const clock = createFakeClock();

  const runtime = {
    spawn: mock<ProcessRuntime['spawn']>((): SpawnedProcess => ({ pid, stdout: null, exited })),
    now: clock.now,
    sleep: clock.sleep,
  } satisfies ProcessRuntime;

  return { runtime, clock };
}
