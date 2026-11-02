import { expect, mock, test } from 'bun:test';
import { buildSteppingClock } from './build-stepping-clock.ts';
import { stopProcessGroups } from './stop-process-groups.ts';
import type { TestProcesses } from './test-processes.ts';

test('it sends SIGKILL to the group of each child, then to the group of the process', async () => {
  const clock = buildSteppingClock();

  const processes = {
    listChildPids: mock<TestProcesses['listChildPids']>(() => [5120, 6230]),
    signalGroup: mock<TestProcesses['signalGroup']>(() => {}),
    probeGroup: mock<TestProcesses['probeGroup']>(() => false),
    now: clock.now,
    sleep: clock.sleep,
  };

  await stopProcessGroups(4417, processes);

  expect(processes.listChildPids).toHaveBeenCalledExactlyOnceWith(4417);

  expect(processes.signalGroup.mock.calls).toStrictEqual([
    [5120, 'SIGKILL'],
    [6230, 'SIGKILL'],
    [4417, 'SIGKILL'],
  ]);

  expect(processes.probeGroup.mock.calls).toStrictEqual([[5120], [6230], [4417]]);
});
