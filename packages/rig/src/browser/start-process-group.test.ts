import { expect, mock, test } from 'bun:test';
import { buildFakeProcessRuntime } from '../../../../test-utils/build-fake-process-runtime.ts';
import { buildStuckProcessGroups } from '../../../../test-utils/build-stuck-process-groups.ts';
import { ProcessGroupStillRunningError } from './process-group-still-running-error.ts';
import { ProcessGroupStopError } from './process-group-stop-error.ts';
import type { ProcessGroups } from './process-groups.ts';
import { startProcessGroup } from './start-process-group.ts';

function setupTest() {
  const controller = new AbortController();

  return {
    controller,
    options: {
      cwd: '/work/notes-app',
      environment: { PATH: '/usr/bin' },
      signal: controller.signal,
      stdout: 'pipe',
    } as const,
  };
}

test('it rejects, after SIGTERM and SIGKILL, when the group still runs once its command exits', async () => {
  const ctx = setupTest();
  const groups = buildStuckProcessGroups();

  const group = startProcessGroup(['bun', 'test'], {
    ...ctx.options,
    stopDeadlineMs: 100,
    groups,
    runtime: buildFakeProcessRuntime(4417, Promise.resolve(0)),
  });

  const failure = await group.exited.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toBeInstanceOf(ProcessGroupStillRunningError);

  expect(failure).toMatchObject({
    message: `the process group ${group.pid} still runs after SIGKILL`,
    groupID: group.pid,
  });

  expect(groups.signalGroup.mock.calls).toStrictEqual([
    [group.pid, 'SIGTERM'],
    [group.pid, 'SIGKILL'],
  ]);
});

test('it rejects on abort when the leader itself outlives SIGKILL and never exits', async () => {
  const ctx = setupTest();
  const groups = buildStuckProcessGroups();

  const group = startProcessGroup(['bun', 'test'], {
    ...ctx.options,
    stopDeadlineMs: 100,
    groups,
    runtime: buildFakeProcessRuntime(4417, Promise.withResolvers<number>().promise),
  });

  ctx.controller.abort();

  const failure = await group.exited.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toBeInstanceOf(ProcessGroupStillRunningError);
  expect(failure).toMatchObject({ groupID: 4417 });

  expect(groups.signalGroup.mock.calls).toStrictEqual([
    [4417, 'SIGTERM'],
    [4417, 'SIGKILL'],
  ]);
});

test('it rejects with the cause when a signal to the group fails', async () => {
  const ctx = setupTest();
  const denied = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });

  const groups = {
    probeGroup: mock<ProcessGroups['probeGroup']>(() => true),
    signalGroup: mock<ProcessGroups['signalGroup']>(() => {
      throw denied;
    }),
  } satisfies ProcessGroups;

  const group = startProcessGroup(['bun', 'test'], {
    ...ctx.options,
    stopDeadlineMs: 100,
    groups,
    runtime: buildFakeProcessRuntime(4417, Promise.resolve(0)),
  });

  const failure = await group.exited.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toBeInstanceOf(ProcessGroupStopError);

  expect(failure).toMatchObject({
    message: 'rig could not stop the process group 4417',
    groupID: 4417,
    cause: denied,
  });
});
