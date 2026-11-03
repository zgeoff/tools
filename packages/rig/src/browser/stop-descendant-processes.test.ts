import { expect, mock, test } from 'bun:test';
import { buildProcessEntry } from '../test-utils/build-process-entry.ts';
import { buildSteppingClock } from '../test-utils/build-stepping-clock.ts';
import type { ProcessEntry } from './read-process-table.ts';
import type { DescendantStop } from './stop-descendant-processes.ts';
import { stopDescendantProcesses } from './stop-descendant-processes.ts';

function setupTest() {
  const listings: (readonly ProcessEntry[] | null)[] = [];

  const readProcessTable = mock<DescendantStop['readProcessTable']>(() =>
    listings.length > 1 ? (listings.shift() ?? null) : (listings[0] ?? null),
  );

  const signalProcess = mock<DescendantStop['signalProcess']>(() => {});
  const clock = buildSteppingClock();

  return {
    clock,
    signalProcess,
    startingTable: [
      buildProcessEntry(4000, 1),
      buildProcessEntry(4100, 4000),
      buildProcessEntry(4120, 4100),
      buildProcessEntry(4130, 4120),
      buildProcessEntry(5200, 1),
    ],
    queueListings: (queued: readonly (readonly ProcessEntry[] | null)[]) => {
      listings.push(...queued);
    },
    stop: { rootPID: 4100, deadlineMs: 5000, clock, readProcessTable, signalProcess },
  };
}

test("it kills every descendant of the root, and none of the root's ancestors or other processes", async () => {
  const ctx = setupTest();

  ctx.queueListings([
    ctx.startingTable,
    [buildProcessEntry(4000, 1), buildProcessEntry(4100, 4000)],
  ]);

  await stopDescendantProcesses(ctx.stop);

  expect(ctx.signalProcess.mock.calls).toStrictEqual([
    [4120, 'SIGKILL'],
    [4130, 'SIGKILL'],
  ]);
});

test('it waits until each descendant leaves the listing, zombies included', async () => {
  const ctx = setupTest();

  ctx.queueListings([
    ctx.startingTable,
    ctx.startingTable,
    [buildProcessEntry(4100, 4000), buildProcessEntry(4130, 1)],
    [buildProcessEntry(4100, 4000), buildProcessEntry(4120, 4100, 'Z')],
    [buildProcessEntry(4100, 4000)],
  ]);

  await stopDescendantProcesses(ctx.stop);

  expect(ctx.clock.sleep).toHaveBeenCalledTimes(3);
});

test('it resolves at the deadline when only zombies remain, which no process reaps', async () => {
  const ctx = setupTest();

  ctx.queueListings([
    ctx.startingTable,
    [buildProcessEntry(4100, 4000), buildProcessEntry(4130, 1, 'Z')],
  ]);

  await stopDescendantProcesses(ctx.stop);

  expect(ctx.clock.now()).toBe(5000);
});

test('it throws with the descendants that are no zombie and still run at the deadline', async () => {
  const ctx = setupTest();

  ctx.queueListings([
    ctx.startingTable,
    [...ctx.startingTable, buildProcessEntry(4140, 4130, 'Z')],
  ]);

  const failure = await stopDescendantProcesses(ctx.stop).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    message: 'the processes 4120, 4130 still run 5000 ms after SIGKILL',
  });

  expect(ctx.clock.now()).toBe(5000);
});

test('it goes on past a descendant that exits before its signal', async () => {
  const ctx = setupTest();

  ctx.queueListings([ctx.startingTable, [buildProcessEntry(4100, 4000)]]);

  ctx.signalProcess.mockImplementationOnce(() => {
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
  });

  await stopDescendantProcesses(ctx.stop);

  expect(ctx.signalProcess).toHaveBeenCalledTimes(2);
});

test('it throws a signal failure other than a process that has exited', async () => {
  const ctx = setupTest();

  ctx.queueListings([ctx.startingTable]);

  ctx.signalProcess.mockImplementation(() => {
    throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  });

  const failure = await stopDescendantProcesses(ctx.stop).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ code: 'EPERM' });
});

test('it kills nothing when the first listing fails', async () => {
  const ctx = setupTest();

  ctx.queueListings([null]);

  await stopDescendantProcesses(ctx.stop);

  expect(ctx.signalProcess).not.toHaveBeenCalled();
});

test('it counts every descendant as running while a later listing fails', async () => {
  const ctx = setupTest();

  ctx.queueListings([ctx.startingTable, null]);

  const failure = await stopDescendantProcesses(ctx.stop).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    message: 'the processes 4120, 4130 still run 5000 ms after SIGKILL',
  });
});
