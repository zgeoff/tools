import { expect, mock, test } from 'bun:test';
import { createFakeClock, runClockUntil } from '@zgeoff/testing/clock';
import { makeAnswerQueue } from '@zgeoff/testing/mocks';
import { buildStuckProcessGroups } from './build-stuck-process-groups.ts';
import { killProcessGroups } from './kill-process-groups.ts';
import type { TestProcesses } from './test-processes.ts';
import { trackSettled } from './track-settled.ts';

test('it sends SIGKILL to each group, and waits until none of them runs', async () => {
  const clock = createFakeClock();
  const isRunning = makeAnswerQueue([true, false, false, false]);

  const processes = {
    signalGroup: mock<TestProcesses['signalGroup']>(() => {}),
    probeGroup: mock<TestProcesses['probeGroup']>(() => isRunning()),
    now: clock.now,
    sleep: clock.sleep,
  };

  const run = killProcessGroups([5120, 6230], processes);

  await runClockUntil(clock, trackSettled(run).isSettled, { maxMs: 60_000 });
  await run;

  expect(processes.signalGroup.mock.calls).toStrictEqual([
    [5120, 'SIGKILL'],
    [6230, 'SIGKILL'],
  ]);

  expect(processes.probeGroup.mock.calls).toStrictEqual([[5120], [6230], [5120], [6230]]);
  expect(clock.delays).toStrictEqual([20]);
});

test('it fails, naming the groups, when a group still runs at the deadline', async () => {
  const clock = createFakeClock();
  const processes = { ...buildStuckProcessGroups(), now: clock.now, sleep: clock.sleep };
  const run = killProcessGroups([5120], processes);

  await runClockUntil(clock, trackSettled(run).isSettled, { maxMs: 60_000 });

  const failure = await run.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ message: 'the process groups 5120 still run after SIGKILL' });
  expect(clock.now()).toBeGreaterThanOrEqual(5000);
});
