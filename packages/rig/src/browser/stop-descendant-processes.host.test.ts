import { expect, mock, onTestFinished, test } from 'bun:test';
import { makeAnswerQueue } from '@zgeoff/std/test-utils/make-answer-queue';
import { systemClock } from '../system-clock.ts';
import { buildProcessEntry } from '../test-utils/build-process-entry.ts';
import { stopProcessGroups } from '../test-utils/stop-process-groups.ts';
import { testProcesses } from '../test-utils/test-processes.ts';
import type { ProcessEntry } from './read-process-table.ts';
import { stopDescendantProcesses } from './stop-descendant-processes.ts';

// Root can signal any process, and the kernel drops a SIGKILL to the first process without an
// error, so only another user meets EPERM there.
const isRoot = process.getuid?.() === 0;

function setupTest() {
  return { signalProcess: mock(process.kill.bind(process)) };
}

test('it goes on past a descendant that exits before its signal', async () => {
  const ctx = setupTest();
  const exited = Bun.spawn(['true'], { detached: true });

  onTestFinished(() => stopProcessGroups(exited.pid, testProcesses));

  await exited.exited;

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [buildProcessEntry(4100, 4000), buildProcessEntry(exited.pid, 4100)],
    [buildProcessEntry(4100, 4000)],
  ]);

  expect(
    stopDescendantProcesses({
      rootPID: 4100,
      timeoutMs: 5000,
      clock: systemClock,
      signalProcess: ctx.signalProcess,
      readProcessTable,
    }),
  ).resolves.toBeUndefined();

  expect(ctx.signalProcess.mock.calls).toStrictEqual([[exited.pid, 'SIGKILL']]);
});

test.skipIf(isRoot)('it throws the EPERM of a descendant that another user runs', () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [buildProcessEntry(4100, 4000), buildProcessEntry(1, 4100)],
  ]);

  expect(
    stopDescendantProcesses({
      rootPID: 4100,
      timeoutMs: 5000,
      clock: systemClock,
      signalProcess: ctx.signalProcess,
      readProcessTable,
    }),
  ).rejects.toMatchObject({ code: 'EPERM' });
});
