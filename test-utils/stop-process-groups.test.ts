import { expect, mock, test } from 'bun:test';
import { stopProcessGroups } from './stop-process-groups.ts';
import type { TestProcesses } from './test-processes.ts';

test('it sends SIGKILL to the group of each child, then to the group of the process', () => {
  const processes = {
    listChildPids: mock<TestProcesses['listChildPids']>(() => [5120, 6230]),
    signalGroup: mock<TestProcesses['signalGroup']>(() => {}),
  };

  stopProcessGroups(4417, processes);

  expect(processes.listChildPids).toHaveBeenCalledExactlyOnceWith(4417);

  expect(processes.signalGroup.mock.calls).toStrictEqual([
    [5120, 'SIGKILL'],
    [6230, 'SIGKILL'],
    [4417, 'SIGKILL'],
  ]);
});
