import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { probeProcess } from '../../../test-utils/probe-process.ts';
import { runCommand } from './run-command.ts';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'rig-run-command-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  // A read of a FIFO waits until the command writes to it, so the test needs no poll.
  const pidFIFO = join(directory, 'sleep.pid');

  await $`mkfifo ${pidFIFO}`;

  return { pidFIFO, stack };
}

test('it returns the exit code of the command', async () => {
  const exitCode = await runCommand(['sh', '-c', 'exit 3'], {
    cwd: import.meta.dir,
    environment: { PATH: process.env['PATH'] },
    signal: new AbortController().signal,
  });

  expect(exitCode).toBe(3);
});

test('it hands the command the environment it is given', async () => {
  const exitCode = await runCommand(['sh', '-c', 'test "$KILN_HEAT" = high'], {
    cwd: import.meta.dir,
    environment: { PATH: process.env['PATH'], KILN_HEAT: 'high' },
    signal: new AbortController().signal,
  });

  expect(exitCode).toBe(0);
});

test('it stops the command with SIGTERM on an abort and returns 1', async () => {
  const controller = new AbortController();

  const running = runCommand(['sh', '-c', 'sleep 30'], {
    cwd: import.meta.dir,
    environment: { PATH: process.env['PATH'] },
    signal: controller.signal,
  });

  controller.abort();

  const exitCode = await running;

  expect(exitCode).toBe(1);
});

test('it stops a process that the command started when the run aborts', async () => {
  const ctx = await setupTest();

  const controller = new AbortController();

  const running = runCommand(['sh', '-c', 'sleep 60 & echo $! > "$PID_FIFO"; wait'], {
    cwd: import.meta.dir,
    environment: { PATH: process.env['PATH'], PID_FIFO: ctx.pidFIFO },
    signal: controller.signal,
  });

  // The abort stops the command's whole group, and the run settles once no member of it runs.
  ctx.stack.defer(async () => {
    controller.abort();

    await running;
  });

  const pidText = await Bun.file(ctx.pidFIFO).text();

  const sleepPID = Number(pidText.trim());

  controller.abort();

  const exitCode = await running;

  expect(exitCode).toBe(1);
  expect(probeProcess(sleepPID)).toBeFalse();
});

test('it stops a process that the command leaves running when it exits', async () => {
  const ctx = await setupTest();

  const controller = new AbortController();

  const running = runCommand(['sh', '-c', 'sleep 60 & echo $! > "$PID_FIFO"; exit 4'], {
    cwd: import.meta.dir,
    environment: { PATH: process.env['PATH'], PID_FIFO: ctx.pidFIFO },
    signal: controller.signal,
  });

  ctx.stack.defer(async () => {
    controller.abort();

    await running;
  });

  const pidText = await Bun.file(ctx.pidFIFO).text();

  const sleepPID = Number(pidText.trim());

  const exitCode = await running;

  expect(exitCode).toBe(4);
  expect(probeProcess(sleepPID)).toBeFalse();
});

test('it returns 1 for an exit code 0 when the abort has already arrived', async () => {
  const exitCode = await runCommand(['true'], {
    cwd: import.meta.dir,
    environment: { PATH: process.env['PATH'] },
    signal: AbortSignal.abort(),
  });

  expect(exitCode).toBe(1);
});
