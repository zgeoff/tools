import { expect, mock, test } from 'bun:test';
import { createFakeClock, runClockUntil } from '@zgeoff/testing/clock';
import { makeRepeatingAnswerQueue } from '@zgeoff/testing/mocks';
import { buildProcessEntry } from '../test-utils/build-process-entry.ts';
import { trackSettled } from '../test-utils/track-settled.ts';
import type { ProcessEntry } from './read-process-table.ts';
import type { DescendantStop } from './stop-descendant-processes.ts';
import { stopDescendantProcesses } from './stop-descendant-processes.ts';

function setupTest() {
  const signalProcess = mock<DescendantStop['signalProcess']>(() => true);
  const clock = createFakeClock();

  return {
    clock,
    signalProcess,
  };
}

test("it kills every descendant of the root, and none of the root's ancestors or other processes", async () => {
  const ctx = setupTest();

  const readProcessTable = makeRepeatingAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    [buildProcessEntry(4000, 1), buildProcessEntry(4100, 4000)],
  ]);

  const run = stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  await runClockUntil(ctx.clock, trackSettled(run).isSettled, { maxMs: 60_000 });
  await run;

  expect(ctx.signalProcess.mock.calls).toStrictEqual([
    [4120, 'SIGKILL'],
    [4130, 'SIGKILL'],
  ]);
});

test('it waits until each descendant leaves the listing, zombies included', async () => {
  const ctx = setupTest();

  const readProcessTable = makeRepeatingAnswerQueue<readonly ProcessEntry[] | null>([
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

  const run = stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  await runClockUntil(ctx.clock, trackSettled(run).isSettled, { maxMs: 60_000 });
  await run;

  expect(ctx.clock.delays).toHaveLength(3);
});

test('it resolves at the deadline when only zombies remain, which no process reaps', async () => {
  const ctx = setupTest();

  const readProcessTable = makeRepeatingAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    [buildProcessEntry(4100, 4000), buildProcessEntry(4130, 1, 'Z')],
  ]);

  const run = stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  await runClockUntil(ctx.clock, trackSettled(run).isSettled, { maxMs: 60_000 });
  await run;

  expect(ctx.clock.now()).toBe(5000);
});

test('it throws with the descendants that are no zombie and still run at the deadline', async () => {
  const ctx = setupTest();

  const readProcessTable = makeRepeatingAnswerQueue<readonly ProcessEntry[] | null>([
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

  const run = stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  await runClockUntil(ctx.clock, trackSettled(run).isSettled, { maxMs: 60_000 });

  await expect(run).rejects.toThrowWithMessage(
    Error,
    'the processes 4120, 4130 still run 5000 ms after SIGKILL',
  );

  expect(ctx.clock.now()).toBe(5000);
});

test('it reads a failed first listing again, and kills the descendants that the next one shows', async () => {
  const ctx = setupTest();

  const readProcessTable = makeRepeatingAnswerQueue<readonly ProcessEntry[] | null>([
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

  const run = stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  await runClockUntil(ctx.clock, trackSettled(run).isSettled, { maxMs: 60_000 });
  await run;

  expect(ctx.signalProcess.mock.calls).toStrictEqual([
    [4120, 'SIGKILL'],
    [4130, 'SIGKILL'],
  ]);
});

test('it throws and kills nothing when the listing fails until the deadline', async () => {
  const ctx = setupTest();
  const readProcessTable = makeRepeatingAnswerQueue<readonly ProcessEntry[] | null>([null]);

  const run = stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  await runClockUntil(ctx.clock, trackSettled(run).isSettled, { maxMs: 60_000 });

  await expect(run).rejects.toThrowWithMessage(
    Error,
    'the process listing failed for 5000 ms, so no process stopped',
  );

  expect(ctx.signalProcess).not.toHaveBeenCalled();
  expect(ctx.clock.now()).toBe(5000);
});

test('it counts every descendant as running while a later listing fails', async () => {
  const ctx = setupTest();

  const readProcessTable = makeRepeatingAnswerQueue<readonly ProcessEntry[] | null>([
    [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    null,
  ]);

  const run = stopDescendantProcesses({
    rootPID: 4100,
    timeoutMs: 5000,
    clock: ctx.clock,
    signalProcess: ctx.signalProcess,
    readProcessTable,
  });

  await runClockUntil(ctx.clock, trackSettled(run).isSettled, { maxMs: 60_000 });

  await expect(run).rejects.toThrowWithMessage(
    Error,
    'the processes 4120, 4130 still run 5000 ms after SIGKILL',
  );
});
