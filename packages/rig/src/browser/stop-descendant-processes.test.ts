import { expect, mock, test } from 'bun:test';
import { makeAnswerQueue } from '@zgeoff/std/test-utils/make-answer-queue';
import { buildProcessEntry } from '../test-utils/build-process-entry.ts';
import { buildSteppingClock } from '../test-utils/build-stepping-clock.ts';
import type { ProcessEntry } from './read-process-table.ts';
import type { DescendantStop } from './stop-descendant-processes.ts';
import { stopDescendantProcesses } from './stop-descendant-processes.ts';

function setupTest() {
  const signalProcess = mock<DescendantStop['signalProcess']>(() => true);
  const clock = buildSteppingClock();

  return {
    clock,
    signalProcess,
  };
}

test("it kills every descendant of the root, and none of the root's ancestors or other processes", async () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    [buildProcessEntry(4000, 1), buildProcessEntry(4100, 4000)],
  ]);

  await stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  expect(ctx.signalProcess.mock.calls).toStrictEqual([
    [4120, 'SIGKILL'],
    [4130, 'SIGKILL'],
  ]);
});

test('it waits until each descendant leaves the listing, zombies included', async () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    [buildProcessEntry(4100, 4000), buildProcessEntry(4130, 1)],
    [buildProcessEntry(4100, 4000), buildProcessEntry(4120, 4100, 'Z')],
    [buildProcessEntry(4100, 4000)],
  ]);

  await stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  expect(ctx.clock.sleep).toHaveBeenCalledTimes(3);
});

test('it resolves at the deadline when only zombies remain, which no process reaps', async () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    [buildProcessEntry(4100, 4000), buildProcessEntry(4130, 1, 'Z')],
  ]);

  await stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  expect(ctx.clock.now()).toBe(5000);
});

test('it throws with the descendants that are no zombie and still run at the deadline', () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(4140, 4130),
      buildProcessEntry(5200, 1),
    ],
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
      buildProcessEntry(4140, 4130, 'Z'),
    ],
  ]);

  expect(
    stopDescendantProcesses({
      rootPID: 4100,
      timeoutMs: 5000,
      clock: ctx.clock,
      signalProcess: ctx.signalProcess,
      readProcessTable,
    }),
  ).rejects.toThrowWithMessage(Error, 'the processes 4120, 4130 still run 5000 ms after SIGKILL');

  expect(ctx.clock.now()).toBe(5000);
});

test('it goes on past each descendant that exits before its signal', async () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    [buildProcessEntry(4100, 4000)],
  ]);

  ctx.signalProcess.mockImplementation(() => {
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
  });

  await stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  expect(ctx.signalProcess).toHaveBeenCalledTimes(2);
});

test('it throws a signal failure other than a process that has exited', () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
  ]);

  ctx.signalProcess.mockImplementation(() => {
    throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  });

  expect(
    stopDescendantProcesses({
      rootPID: 4100,
      timeoutMs: 5000,
      clock: ctx.clock,
      signalProcess: ctx.signalProcess,
      readProcessTable,
    }),
  ).rejects.toMatchObject({ code: 'EPERM' });
});

test('it reads a failed first listing again, and kills the descendants that the next one shows', async () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    null,
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    [buildProcessEntry(4000, 1), buildProcessEntry(4100, 4000)],
  ]);

  await stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  expect(ctx.signalProcess.mock.calls).toStrictEqual([
    [4120, 'SIGKILL'],
    [4130, 'SIGKILL'],
  ]);
});

test('it throws and kills nothing when the listing fails until the deadline', () => {
  const ctx = setupTest();
  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([null]);

  expect(
    stopDescendantProcesses({
      rootPID: 4100,
      timeoutMs: 5000,
      clock: ctx.clock,
      signalProcess: ctx.signalProcess,
      readProcessTable,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    'the process listing failed for 5000 ms, so no process stopped',
  );

  expect(ctx.signalProcess).not.toHaveBeenCalled();
  expect(ctx.clock.now()).toBe(5000);
});

test('it counts every descendant as running while a later listing fails', () => {
  const ctx = setupTest();

  const readProcessTable = makeAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    null,
  ]);

  expect(
    stopDescendantProcesses({
      rootPID: 4100,
      timeoutMs: 5000,
      clock: ctx.clock,
      signalProcess: ctx.signalProcess,
      readProcessTable,
    }),
  ).rejects.toThrowWithMessage(Error, 'the processes 4120, 4130 still run 5000 ms after SIGKILL');
});
