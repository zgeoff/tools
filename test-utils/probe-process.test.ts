import { expect, onTestFinished, test } from 'bun:test';
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
