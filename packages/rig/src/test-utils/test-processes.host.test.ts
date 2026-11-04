import { expect, onTestFinished, test } from 'bun:test';
import { readStreamUntil } from '@zgeoff/testing/helpers';
import { testProcesses } from './test-processes.ts';

test('it lists the children of a process, and reads the group each one runs in', async () => {
  const parent = Bun.spawn(['bash', '-c', 'sleep 30 & echo started; wait'], {
    detached: true,
    stdout: 'pipe',
  });

  onTestFinished(async () => {
    testProcesses.signalGroup(parent.pid, 'SIGKILL');

    await parent.exited;
  });

  await readStreamUntil(parent.stdout, 'started');

  const children = testProcesses.listChildPids(parent.pid);
  const groupIDs = children.map((pid) => testProcesses.readGroupID(pid));

  expect(children).toHaveLength(1);
  expect(groupIDs).toStrictEqual([parent.pid]);
});

test('it lists no children, and reads no group, for a process that has exited', async () => {
  const exited = Bun.spawn(['true']);

  await exited.exited;

  expect(testProcesses.listChildPids(exited.pid)).toStrictEqual([]);
  expect(testProcesses.readGroupID(exited.pid)).toBeNull();
});
