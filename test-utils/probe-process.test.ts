import { expect, onTestFinished, test } from 'bun:test';
import { probeProcess as laneProbeProcess } from '../packages/rig/src/browser/probe-process.ts';
import { probeProcess } from './probe-process.ts';

test('it finds a process that runs', () => {
  const sleeper = Bun.spawn(['sleep', '30']);

  onTestFinished(async () => {
    sleeper.kill('SIGKILL');

    await sleeper.exited;
  });

  expect(probeProcess(sleeper.pid)).toBeTrue();
});

test('it finds no process once it has exited', async () => {
  const exited = Bun.spawn(['true']);

  await exited.exited;

  expect(probeProcess(exited.pid)).toBeFalse();
});

test("it is the lane's probe, so a test finds a zombie exited as the lane does", () => {
  expect(probeProcess).toBe(laneProbeProcess);
});
