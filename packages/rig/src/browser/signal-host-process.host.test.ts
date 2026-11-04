import { expect, test } from 'bun:test';
import { signalHostProcess } from './signal-host-process.ts';

test('it sends a signal of 0 to the process that runs it, which checks the process', () => {
  expect(() => {
    signalHostProcess(process.pid, 0);
  }).not.toThrow();
});

test('it throws ESRCH for a process ID that no process holds', () => {
  const failure = (() => {
    try {
      signalHostProcess(2 ** 22 + 1, 0);

      return null;
    } catch (error) {
      return error;
    }
  })();

  expect(failure).toMatchObject({ code: 'ESRCH' });
});
