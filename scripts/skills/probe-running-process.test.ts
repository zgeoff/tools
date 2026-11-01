import { expect, test } from 'bun:test';
import { probeRunningProcess } from './probe-running-process.ts';

test('it finds this process running', () => {
  expect(probeRunningProcess(String(process.pid))).toBeTrue();
});

test('it finds a process that ended not running', async () => {
  const ended = Bun.spawn(['true']);

  await ended.exited;

  expect(probeRunningProcess(String(ended.pid))).toBeFalse();
});

test('it takes an ID that names no single process as not running', () => {
  expect(probeRunningProcess('0')).toBeFalse();
  expect(probeRunningProcess('-1')).toBeFalse();
  expect(probeRunningProcess('kettle')).toBeFalse();
});
