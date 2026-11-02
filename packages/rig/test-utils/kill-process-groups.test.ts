import { expect, mock, test } from 'bun:test';
import { buildSteppingClock } from './build-stepping-clock.ts';
import { buildStuckProcessGroups } from './build-stuck-process-groups.ts';
import { killProcessGroups } from './kill-process-groups.ts';
import { makeAnswerQueue } from './make-answer-queue.ts';
import type { TestProcesses } from './test-processes.ts';

test('it sends SIGKILL to each group, and waits until none of them runs', async () => {
  const clock = buildSteppingClock();
  const isRunning = makeAnswerQueue([true, false, false]);

  const processes = {
    signalGroup: mock<TestProcesses['signalGroup']>(() => {}),
    probeGroup: mock<TestProcesses['probeGroup']>(() => isRunning()),
    now: clock.now,
    sleep: clock.sleep,
  };

  await killProcessGroups([5120, 6230], processes);

  expect(processes.signalGroup.mock.calls).toStrictEqual([
    [5120, 'SIGKILL'],
    [6230, 'SIGKILL'],
  ]);

  expect(processes.probeGroup.mock.calls).toStrictEqual([[5120], [6230], [5120], [6230]]);
  expect(clock.sleep).toHaveBeenCalledOnce();
});

test('it fails, naming the groups, when a group still runs at the deadline', async () => {
  const clock = buildSteppingClock();
  const processes = { ...buildStuckProcessGroups(), now: clock.now, sleep: clock.sleep };

  const failure = await killProcessGroups([5120], processes).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ message: 'the process groups 5120 still run after SIGKILL' });
  expect(clock.now()).toBeGreaterThanOrEqual(5000);
});
