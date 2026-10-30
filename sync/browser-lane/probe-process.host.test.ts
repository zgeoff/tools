import { expect, onTestFinished, test } from 'bun:test';
import { readStreamUntil } from '../../test-utils/read-stream-until.ts';
import { probeProcess } from './probe-process.ts';

test('it finds a process that runs', () => {
  expect(probeProcess(process.pid)).toBeTrue();
});

test('it finds no process once the process has exited', async () => {
  const exited = Bun.spawn(['true']);

  await exited.exited;

  expect(probeProcess(exited.pid)).toBeFalse();
});

test('it finds no process for a zombie that its parent never reaps', async () => {
  // The parent waits for the child's exit without reaping it, so the child stays a zombie.
  const script = [
    'import os, time',
    'pid = os.fork()',
    'if pid == 0:',
    '    os._exit(0)',
    'os.waitid(os.P_PID, pid, os.WEXITED | os.WNOWAIT)',
    'print(pid, flush=True)',
    'time.sleep(30)',
  ].join('\n');

  const parent = Bun.spawn(['python3', '-c', script], { stdout: 'pipe' });

  onTestFinished(async () => {
    parent.kill('SIGKILL');

    await parent.exited;
  });

  const output = await readStreamUntil(parent.stdout, '\n');

  const zombiePID = Number(output.trim());

  const isSignalled = (() => {
    try {
      process.kill(zombiePID, 0);

      return true;
    } catch {
      return false;
    }
  })();

  expect(isSignalled).toBeTrue();
  expect(probeProcess(zombiePID)).toBeFalse();
});
