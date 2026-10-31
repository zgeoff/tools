import { expect, mock, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubProcessProbe } from '../../../../test-utils/build-stub-process-probe.ts';
import { makeListingQueueStub } from '../../../../test-utils/make-listing-queue-stub.ts';
import { makeResolvingStub } from '../../../../test-utils/make-resolving-stub.ts';
import { laneFiles } from './lane-files.ts';
import { probeRun } from './probe-run.ts';
import type { ProcessGroups } from './process-groups.ts';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'rig-probe-run-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  return {
    stack,
    groupsDir: join(directory, 'groups'),
    probeProcess: mock<(pid: number) => boolean>(() => false),
    groups: { probeGroup: mock<ProcessGroups['probeGroup']>(() => false) },
  };
}

test('it finds a run live while its lane runs, and touches none of its records', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.groupsDir, 'pending-tests'), { recursive: true });

  ctx.probeProcess.mockReturnValue(true);

  const isLive = await probeRun('4417', ctx.groupsDir, {
    files: laneFiles,
    probeProcess: ctx.probeProcess,
    groups: ctx.groups,
  });

  const records = await readdir(ctx.groupsDir);

  expect(isLive).toBeTrue();
  expect(ctx.probeProcess).toHaveBeenCalledExactlyOnceWith(4417);
  expect(records).toStrictEqual(['pending-tests']);
});

test('it finds a run live while a group it recorded still runs', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.groupsDir, '5120'), { recursive: true });

  ctx.groups.probeGroup.mockImplementation(buildStubProcessProbe([5120]));

  const isLive = await probeRun('4417', ctx.groupsDir, {
    files: laneFiles,
    probeProcess: ctx.probeProcess,
    groups: ctx.groups,
  });

  expect(isLive).toBeTrue();
});

test('it removes the pending records of an exited lane, so no command can record a group after the probe', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.groupsDir, 'pending-build'), { recursive: true });
  await mkdir(join(ctx.groupsDir, 'pending-tests'));
  await mkdir(join(ctx.groupsDir, '5120'));

  const isLive = await probeRun('4417', ctx.groupsDir, {
    files: laneFiles,
    probeProcess: ctx.probeProcess,
    groups: ctx.groups,
  });

  const records = await readdir(ctx.groupsDir);

  expect(isLive).toBeFalse();
  expect(records).toStrictEqual(['5120']);
  expect(ctx.groups.probeGroup.mock.calls).toStrictEqual([[5120]]);
});

test('it finds a run live when a command records its group just before the sweep removes its pending record', async () => {
  const ctx = await setupTest();

  ctx.groups.probeGroup.mockImplementation(buildStubProcessProbe([6230]));

  // The command moves its pending record to its group ID between the two reads of the folder, a
  // window that a real folder cannot hold open, so a queue of listings stands in for the reads.
  const isLive = await probeRun('4417', ctx.groupsDir, {
    files: {
      readDirNames: makeListingQueueStub([['pending-tests'], ['6230']]),
      removePath: makeResolvingStub(undefined),
    },
    probeProcess: ctx.probeProcess,
    groups: ctx.groups,
  });

  expect(isLive).toBeTrue();
});

test('it finds a run exited when its lane and every group it recorded have exited', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.groupsDir, '5120'), { recursive: true });
  await mkdir(join(ctx.groupsDir, '6230'));

  const isLive = await probeRun('4417', ctx.groupsDir, {
    files: laneFiles,
    probeProcess: ctx.probeProcess,
    groups: ctx.groups,
  });

  expect(isLive).toBeFalse();

  expect(
    ctx.groups.probeGroup.mock.calls.toSorted(([left], [right]) => left - right),
  ).toStrictEqual([[5120], [6230]]);
});

test('it fails when it cannot remove a pending record', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.groupsDir, 'pending-tests'), { recursive: true });
  await chmod(ctx.groupsDir, 0o500);

  ctx.stack.defer(() => chmod(ctx.groupsDir, 0o700));

  const failure = await probeRun('4417', ctx.groupsDir, {
    files: laneFiles,
    probeProcess: ctx.probeProcess,
    groups: ctx.groups,
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ code: 'EACCES' });
});
