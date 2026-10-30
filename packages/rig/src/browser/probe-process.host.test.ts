import { expect, test } from 'bun:test';
import { probeProcess } from './probe-process.ts';

test('it finds a process that runs', () => {
  expect(probeProcess(process.pid)).toBeTrue();
});

test('it finds no process once the process has exited', async () => {
  const exited = Bun.spawn(['true']);

  await exited.exited;

  expect(probeProcess(exited.pid)).toBeFalse();
});
