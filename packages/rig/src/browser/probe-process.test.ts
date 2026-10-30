import { expect, mock, test } from 'bun:test';
import type { ProcessProbeDependencies } from './probe-process.ts';
import { probeProcess } from './probe-process.ts';
import type { ProcessEntry } from './read-process-table.ts';

function setupTest() {
  return {
    dependencies: {
      signalProcess: mock<ProcessProbeDependencies['signalProcess']>(() => {}),
      readProcessTable: mock<() => readonly ProcessEntry[] | null>(() => null),
    },
  };
}

test('it finds no process that the signal probe reports missing, and reads no process table', () => {
  const ctx = setupTest();

  ctx.dependencies.signalProcess.mockImplementation(() => {
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
  });

  const isLive = probeProcess(6230, ctx.dependencies);

  expect(isLive).toBeFalse();
  expect(ctx.dependencies.signalProcess).toHaveBeenCalledExactlyOnceWith(6230, 0);
  expect(ctx.dependencies.readProcessTable).not.toHaveBeenCalled();
});

test('it finds a process of another user that the listing shows running, though the signal probe is refused', () => {
  const ctx = setupTest();

  ctx.dependencies.signalProcess.mockImplementation(() => {
    throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  });

  ctx.dependencies.readProcessTable.mockReturnValue([{ pid: 6230, groupID: 6230, state: 'S' }]);

  const isLive = probeProcess(6230, ctx.dependencies);

  expect(isLive).toBeTrue();
});

test('it finds no process of another user that the listing shows as a zombie', () => {
  const ctx = setupTest();

  ctx.dependencies.signalProcess.mockImplementation(() => {
    throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  });

  ctx.dependencies.readProcessTable.mockReturnValue([{ pid: 6230, groupID: 6230, state: 'Z' }]);

  const isLive = probeProcess(6230, ctx.dependencies);

  expect(isLive).toBeFalse();
});

test('it finds a process live when the process listing fails, so a sweep keeps its run', () => {
  const ctx = setupTest();

  ctx.dependencies.readProcessTable.mockReturnValue(null);

  expect(probeProcess(6230, ctx.dependencies)).toBeTrue();
});

test('it finds no process that the listing leaves out', () => {
  const ctx = setupTest();

  ctx.dependencies.readProcessTable.mockReturnValue([{ pid: 1, groupID: 1, state: 'Ss' }]);

  expect(probeProcess(6230, ctx.dependencies)).toBeFalse();
});

test('it finds no process that the listing shows as a zombie', () => {
  const ctx = setupTest();

  ctx.dependencies.readProcessTable.mockReturnValue([{ pid: 6230, groupID: 6230, state: 'Z+' }]);

  expect(probeProcess(6230, ctx.dependencies)).toBeFalse();
});

test('it finds a process that the listing shows running', () => {
  const ctx = setupTest();

  ctx.dependencies.readProcessTable.mockReturnValue([{ pid: 6230, groupID: 6230, state: 'Sl+' }]);

  expect(probeProcess(6230, ctx.dependencies)).toBeTrue();
});
