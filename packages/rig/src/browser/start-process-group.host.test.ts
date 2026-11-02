import { expect, onTestFinished, test } from 'bun:test';
import { readStreamUntil } from '../../test-utils/read-stream-until.ts';
import { trackSettled } from '../../test-utils/track-settled.ts';
import { processGroups } from './process-groups.ts';
import { processRuntime } from './process-runtime.ts';
import { startProcessGroup } from './start-process-group.ts';

function setupTest() {
  const controller = new AbortController();

  return {
    controller,
    options: {
      cwd: import.meta.dir,
      environment: process.env,
      signal: controller.signal,
      stdout: 'pipe',
      stopDeadlineMs: 300,
      groups: processGroups,
      runtime: processRuntime,
    } as const,
  };
}

test('it settles with the exit code of the command', async () => {
  const ctx = setupTest();
  const group = startProcessGroup(['bash', '-c', 'exit 3'], ctx.options);
  const exit = trackSettled(group.exited);

  onTestFinished(() => {
    if (!exit.isSettled()) {
      processGroups.signalGroup(group.pid, 'SIGKILL');
    }
  });

  const exitCode = await group.exited;

  expect(exitCode).toBe(3);
});

test('it stops the processes that the command leaves running when it exits', async () => {
  const ctx = setupTest();

  const group = startProcessGroup(
    ['bash', '-c', 'sleep 30 & echo "helper $!"; exit 3'],
    ctx.options,
  );

  const exit = trackSettled(group.exited);

  onTestFinished(() => {
    if (!exit.isSettled()) {
      processGroups.signalGroup(group.pid, 'SIGKILL');
    }
  });

  const output = await readStreamUntil(group.stdout ?? new ReadableStream(), '\n');
  const exitCode = await group.exited;

  expect(output).toStartWith('helper ');
  expect(exitCode).toBe(3);
  expect(processGroups.probeGroup(group.pid)).toBeFalse();
});

test('it stops the whole group on abort', async () => {
  const ctx = setupTest();
  const group = startProcessGroup(['bash', '-c', 'sleep 30 & echo started; wait'], ctx.options);
  const exit = trackSettled(group.exited);

  onTestFinished(() => {
    if (!exit.isSettled()) {
      processGroups.signalGroup(group.pid, 'SIGKILL');
    }
  });

  await readStreamUntil(group.stdout ?? new ReadableStream(), 'started');

  ctx.controller.abort();

  const exitCode = await group.exited;

  expect(exitCode).toBe(143);
  expect(processGroups.probeGroup(group.pid)).toBeFalse();
});

test('it sends SIGKILL once the deadline passes, to a command that ignores SIGTERM', async () => {
  const ctx = setupTest();

  const group = startProcessGroup(
    ['bash', '-c', "trap '' TERM; echo started; sleep 30 & wait"],
    ctx.options,
  );

  const exit = trackSettled(group.exited);

  onTestFinished(() => {
    if (!exit.isSettled()) {
      processGroups.signalGroup(group.pid, 'SIGKILL');
    }
  });

  await readStreamUntil(group.stdout ?? new ReadableStream(), 'started');

  const abortedAt = Date.now();

  ctx.controller.abort();

  const exitCode = await group.exited;

  const stoppedAfterMs = Date.now() - abortedAt;

  expect(exitCode).toBe(137);
  expect(stoppedAfterMs).toBeGreaterThanOrEqual(300);
  expect(processGroups.probeGroup(group.pid)).toBeFalse();
});
