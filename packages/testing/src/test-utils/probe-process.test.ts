import { expect, test } from 'bun:test';
import { probeProcess } from './probe-process.ts';

test('it finds a running process', () => {
  expect(probeProcess(process.pid)).toBeTrue();
});

test('it reports a process that has exited as gone', async () => {
  const exited = Bun.spawn(['true']);

  await exited.exited;

  expect(probeProcess(exited.pid)).toBeFalse();
});
