import { expect, onTestFinished, test } from 'bun:test';
import { killProcessGroups } from './kill-process-groups.ts';
import { probeProcess } from './probe-process.ts';
import { readStreamUntil } from './read-stream-until.ts';
import { stopProcessGroups } from './stop-process-groups.ts';
import { testProcesses } from './test-processes.ts';

test('it stops a process and the detached child that leads a group of its own, and waits for both', async () => {
  const parent = Bun.spawn(
    [
      process.execPath,
      '-e',
      "const child = Bun.spawn(['sleep', '30'], { detached: true }); console.log('child ' + child.pid); setInterval(() => {}, 1000);",
    ],
    { detached: true, stdout: 'pipe' },
  );

  const startedGroupIDs = [parent.pid];

  onTestFinished(async () => {
    await killProcessGroups(startedGroupIDs, testProcesses);
    await parent.exited;
  });

  const output = await readStreamUntil(parent.stdout, '\n');

  const childPid = Number(/child (?<pid>\d+)/u.exec(output)?.groups?.['pid']);

  startedGroupIDs.push(childPid);

  await stopProcessGroups(parent.pid, testProcesses);

  expect(childPid).toBeGreaterThan(0);
  expect(testProcesses.probeGroup(parent.pid)).toBeFalse();
  expect(probeProcess(childPid)).toBeFalse();
});

test('it stops nothing, and fails nothing, when the process has exited', async () => {
  const exited = Bun.spawn(['true'], { detached: true });

  await exited.exited;

  expect(stopProcessGroups(exited.pid, testProcesses)).resolves.toBeUndefined();
});
