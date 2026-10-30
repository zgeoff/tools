import { expect, onTestFinished, test } from 'bun:test';
import { readStreamUntil } from '../../../../test-utils/read-stream-until.ts';
import { processGroups } from './process-groups.ts';

test('it finds a group that runs, and finds none once the group is stopped', async () => {
  const leader = Bun.spawn(['sleep', '30'], { detached: true });

  onTestFinished(async () => {
    if (leader.exitCode === null && leader.signalCode === null) {
      processGroups.signalGroup(leader.pid, 'SIGKILL');
    }

    await leader.exited;
  });

  const isRunning = processGroups.probeGroup(leader.pid);

  processGroups.signalGroup(leader.pid, 'SIGKILL');

  await leader.exited;

  expect(isRunning).toBeTrue();
  expect(processGroups.probeGroup(leader.pid)).toBeFalse();
  expect(leader.signalCode).toBe('SIGKILL');
});

test('it signals nothing, and fails nothing, for a group that has exited', async () => {
  const leader = Bun.spawn(['true'], { detached: true });

  await leader.exited;

  expect(() => {
    processGroups.signalGroup(leader.pid, 'SIGTERM');
  }).not.toThrow();
});

test('it finds no group when only a zombie that its parent never reaps is left in it', async () => {
  // The parent waits for the child's exit without reaping it, so the child stays a zombie.
  const script = [
    'import os, time',
    'pid = os.fork()',
    'if pid == 0:',
    '    os.setpgid(0, 0)',
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

  const zombieGroupID = Number(output.trim());

  const isSignalled = (() => {
    try {
      process.kill(-zombieGroupID, 0);

      return true;
    } catch {
      return false;
    }
  })();

  expect(isSignalled).toBeTrue();
  expect(processGroups.probeGroup(zombieGroupID)).toBeFalse();
});
