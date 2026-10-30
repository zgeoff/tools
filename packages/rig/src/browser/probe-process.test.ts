import { expect, test } from 'bun:test';
import { probeProcess } from './probe-process.ts';

test('it finds a process live when the process listing fails, so a sweep keeps its run', () => {
  expect(probeProcess(process.pid, () => null)).toBeTrue();
});

test('it finds no process that the listing leaves out', () => {
  const isLive = probeProcess(process.pid, () => [{ pid: 1, groupID: 1, state: 'Ss' }]);

  expect(isLive).toBeFalse();
});

test('it finds no process that the listing shows as a zombie', () => {
  const isLive = probeProcess(process.pid, () => [
    { pid: process.pid, groupID: process.pid, state: 'Z+' },
  ]);

  expect(isLive).toBeFalse();
});

test('it finds a process that the listing shows running', () => {
  const isLive = probeProcess(process.pid, () => [
    { pid: process.pid, groupID: process.pid, state: 'Sl+' },
  ]);

  expect(isLive).toBeTrue();
});
