import { expect, test } from 'bun:test';
import { runCommand } from './run-command.ts';

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

test('it returns 1 for an exit code 0 when the abort has already arrived', async () => {
  const exitCode = await runCommand(['true'], {
    cwd: import.meta.dir,
    environment: { PATH: process.env['PATH'] },
    signal: AbortSignal.abort(),
  });

  expect(exitCode).toBe(1);
});
