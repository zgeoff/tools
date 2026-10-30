import { expect, onTestFinished, test } from 'bun:test';
import { probeProcess } from './probe-process.ts';
import { readStreamUntil } from './read-stream-until.ts';
import { stopProcessGroups } from './stop-process-groups.ts';
import { testProcesses } from './test-processes.ts';

test('it stops a process and the detached child that leads a group of its own', async () => {
  const parent = Bun.spawn(
    [
      process.execPath,
      '-e',
      "const child = Bun.spawn(['sleep', '30'], { detached: true }); console.log('child ' + child.pid); setInterval(() => {}, 1000);",
    ],
    { detached: true, stdout: 'pipe' },
  );

  const startedPids = [parent.pid];

  onTestFinished(() => {
    for (const pid of startedPids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // The process has already exited.
      }
    }
  });

  const output = await readStreamUntil(parent.stdout, '\n');

  const childPid = Number(/child (?<pid>\d+)/u.exec(output)?.groups?.['pid']);

  startedPids.push(childPid);

  stopProcessGroups(parent.pid, testProcesses);

  await parent.exited;

  const child = Bun.spawnSync(['ps', '-o', 'stat=', '-p', String(childPid)]).stdout.toString();

  expect(childPid).toBeGreaterThan(0);
  expect(child.trim()).toBeOneOf(['', 'Z']);
});

test('it stops nothing, and fails nothing, when the process has exited', async () => {
  const exited = Bun.spawn(['true'], { detached: true });

  await exited.exited;

  expect(() => {
    stopProcessGroups(exited.pid, testProcesses);
  }).not.toThrow();

  expect(probeProcess(exited.pid)).toBeFalse();
});
