import { expect, mock, test } from 'bun:test';
import { makeListingQueueStub } from '../../../../test-utils/make-listing-queue-stub.ts';
import type { LaneFiles } from './lane-files.ts';
import { probeRun } from './probe-run.ts';
import type { ProcessGroups } from './process-groups.ts';

function setupTest() {
  return {
    options: {
      files: {
        readDirNames: mock<LaneFiles['readDirNames']>(),
        removePath: mock<LaneFiles['removePath']>(() => Promise.resolve()),
      },
      probeProcess: mock<(pid: number) => boolean>(() => false),
      groups: { probeGroup: mock<ProcessGroups['probeGroup']>(() => false) },
    },
  };
}

test('it finds a run live while its lane runs, and touches none of its records', async () => {
  const ctx = setupTest();

  ctx.options.probeProcess.mockReturnValue(true);

  const isLive = await probeRun('4417', '/runs/4417/groups', ctx.options);

  expect(isLive).toBeTrue();
  expect(ctx.options.probeProcess).toHaveBeenCalledExactlyOnceWith(4417);
  expect(ctx.options.files.readDirNames).not.toHaveBeenCalled();
  expect(ctx.options.files.removePath).not.toHaveBeenCalled();
});

test('it finds a run live while a group it recorded still runs', async () => {
  const ctx = setupTest();

  ctx.options.files.readDirNames.mockImplementation(makeListingQueueStub([['5120'], ['5120']]));
  ctx.options.groups.probeGroup.mockImplementation((groupID) => groupID === 5120);

  const isLive = await probeRun('4417', '/runs/4417/groups', ctx.options);

  expect(isLive).toBeTrue();
});

test('it removes the pending records of an exited lane, so no command can record a group after the probe', async () => {
  const ctx = setupTest();

  ctx.options.files.readDirNames.mockImplementation(
    makeListingQueueStub([['pending-build', '5120', 'pending-tests'], ['5120']]),
  );

  const isLive = await probeRun('4417', '/runs/4417/groups', ctx.options);

  expect(isLive).toBeFalse();

  expect(ctx.options.files.removePath.mock.calls).toStrictEqual([
    ['/runs/4417/groups/pending-build'],
    ['/runs/4417/groups/pending-tests'],
  ]);

  expect(ctx.options.groups.probeGroup.mock.calls).toStrictEqual([[5120]]);
});

test('it finds a run live when a command records its group just before the sweep removes its pending record', async () => {
  const ctx = setupTest();

  // The command moves its pending record to its group ID between the two reads of the folder.
  ctx.options.files.readDirNames.mockImplementation(
    makeListingQueueStub([['pending-tests'], ['6230']]),
  );

  ctx.options.groups.probeGroup.mockImplementation((groupID) => groupID === 6230);

  const isLive = await probeRun('4417', '/runs/4417/groups', ctx.options);

  expect(isLive).toBeTrue();
});

test('it finds a run exited when its lane and every group it recorded have exited', async () => {
  const ctx = setupTest();

  ctx.options.files.readDirNames.mockImplementation(
    makeListingQueueStub([
      ['5120', '6230'],
      ['5120', '6230'],
    ]),
  );

  const isLive = await probeRun('4417', '/runs/4417/groups', ctx.options);

  expect(isLive).toBeFalse();
  expect(ctx.options.groups.probeGroup.mock.calls).toStrictEqual([[5120], [6230]]);
});

test('it fails when it cannot remove a pending record', async () => {
  const ctx = setupTest();
  const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });

  ctx.options.files.readDirNames.mockImplementation(makeListingQueueStub([['pending-tests']]));
  ctx.options.files.removePath.mockRejectedValue(denied);

  const failure = await probeRun('4417', '/runs/4417/groups', ctx.options).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toBe(denied);
});
